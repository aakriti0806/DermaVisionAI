"""EfficientNet-B0 inference with Grad-CAM. torch is imported lazily so the API can start without it."""
import hashlib
import threading

import numpy as np
from PIL import Image

from ..config import get_settings
from .lesion_info import CLASS_INFO

settings = get_settings()
DEFAULT_CLASSES = sorted(CLASS_INFO)  # akiec, bcc, bkl, df, mel, nv, vasc (must match ml/train.py)


class ModelNotReady(RuntimeError):
    pass


class Classifier:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self.model = None
        self.class_names: list[str] = DEFAULT_CLASSES
        self.temperature = 1.0
        self.img_size = 224

    @property
    def has_weights(self) -> bool:
        return settings.model_path.exists()

    @property
    def available(self) -> bool:
        return self.has_weights or settings.demo_mode

    @property
    def demo(self) -> bool:
        return not self.has_weights and settings.demo_mode

    def _load(self) -> None:
        import torch
        from torchvision.models import efficientnet_b0

        ckpt = torch.load(settings.model_path, map_location="cpu", weights_only=True)
        self.class_names = ckpt["class_names"]
        self.temperature = float(ckpt.get("temperature", 1.0))
        self.img_size = int(ckpt.get("img_size", 224))
        model = efficientnet_b0(weights=None)
        model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, len(self.class_names))
        model.load_state_dict(ckpt["state_dict"])
        model.eval()
        self.model = model
        self._loaded = True

    def predict(self, image: Image.Image, raw_bytes: bytes) -> tuple[dict[str, float], Image.Image | None]:
        """Return ({class_code: probability}, grad-cam overlay or None)."""
        if self.has_weights:
            with self._lock:
                if not self._loaded:
                    self._load()
                return self._predict_real(image)
        if settings.demo_mode:
            return self._predict_demo(raw_bytes), None
        raise ModelNotReady("No trained model found. Train one with ml/train.py or set DEMO_MODE=true.")

    # ---- demo (clearly flagged to the user; never use for real screening) ----
    def _predict_demo(self, raw_bytes: bytes) -> dict[str, float]:
        seed = int.from_bytes(hashlib.sha256(raw_bytes).digest()[:8], "big")
        p = np.random.default_rng(seed).dirichlet(np.full(len(DEFAULT_CLASSES), 0.4))
        return {c: float(v) for c, v in zip(DEFAULT_CLASSES, p)}

    # ---- real model ----
    def _predict_real(self, image: Image.Image):
        import cv2
        import torch
        from torchvision import transforms

        tf = transforms.Compose(
            [
                transforms.Resize((self.img_size, self.img_size)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )
        x = tf(image).unsqueeze(0)

        # Grad-CAM on the last conv block. A tensor hook (not a module backward hook) avoids
        # problems with EfficientNet's in-place SiLU activations.
        store: dict = {}
        layer = self.model.features[-1]

        def fwd_hook(_module, _inp, out):
            store["act"] = out
            out.register_hook(lambda g: store.__setitem__("grad", g))

        handle = layer.register_forward_hook(fwd_hook)
        try:
            with torch.enable_grad():
                logits = self.model(x)
                probs = torch.softmax(logits.detach() / self.temperature, dim=1)[0]
                self.model.zero_grad(set_to_none=True)
                logits[0, int(logits.argmax())].backward()
        finally:
            handle.remove()

        weights = store["grad"].mean(dim=(2, 3), keepdim=True)
        cam = torch.relu((weights * store["act"]).sum(dim=1))[0].detach().cpu().numpy()
        cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)
        w, h = image.size
        cam = cv2.resize(cam, (w, h))
        heat = cv2.applyColorMap((cam * 255).astype(np.uint8), cv2.COLORMAP_JET)[:, :, ::-1]
        overlay = (0.6 * np.asarray(image.convert("RGB")) + 0.4 * heat).astype(np.uint8)

        return {c: float(p) for c, p in zip(self.class_names, probs.tolist())}, Image.fromarray(overlay)


classifier = Classifier()
