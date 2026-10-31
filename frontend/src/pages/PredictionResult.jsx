import { Download, Expand, Lightbulb, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MedicalDisclaimer } from '../components/MedicalDisclaimer'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { RiskBadge } from '../components/ui/RiskBadge'
import { Spinner } from '../components/ui/Spinner'
import { scanApi } from '../services/api'
import { confidencePercent } from '../utils/validation'

export default function PredictionResult() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [scan, setScan] = useState(location.state?.result ?? null)
  const [loading, setLoading] = useState(!location.state?.result)
  const [showGradcamFull, setShowGradcamFull] = useState(false)

  useEffect(() => {
    if (location.state?.result) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await scanApi.getById(id)
        if (!cancelled) setScan(data)
      } catch {
        if (!cancelled) navigate('/history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, location.state?.result, navigate])

  if (loading || !scan) return <Spinner label="Loading results…" />

  const top = scan.top_classes ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Prediction Result</h2>
          <p className="text-sm text-slate-500">Scan #{scan.scan_number}</p>
        </div>
        <Button variant="secondary" onClick={() => navigate(`/reports/${scan.id}`)}>
          <Download className="h-4 w-4" aria-hidden />
          Download Report
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900">Uploaded Image</h3>
          <img
            src={scan.image_url}
            alt="Uploaded skin lesion"
            className="w-full rounded-xl object-cover ring-1 ring-slate-200"
          />
        </Card>

        <Card className="space-y-5">
          <div>
            <p className="text-sm text-slate-500">Predicted category</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-bold text-slate-900">{scan.prediction}</h3>
              <RiskBadge label={scan.prediction} riskLevel={scan.risk_level} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-slate-600">Confidence</span>
              <span className="font-semibold text-slate-900">{confidencePercent(scan.confidence)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-brand-gradient"
                style={{ width: `${Math.round(scan.confidence * 100)}%` }}
              />
            </div>
          </div>

          <div>
            <h4 className="mb-3 font-semibold text-slate-900">Top 3 Probabilities</h4>
            <ol className="space-y-2">
              {top.slice(0, 3).map((item, idx) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">
                    {idx + 1}. {item.label}
                  </span>
                  <span className="text-slate-600">{confidencePercent(item.probability)}</span>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Grad-CAM Visualization</h3>
          <Button variant="ghost" className="py-1.5" onClick={() => setShowGradcamFull(true)}>
            <Expand className="h-4 w-4" aria-hidden />
            View Full Image
          </Button>
        </div>
        <div className="relative overflow-hidden rounded-xl ring-1 ring-slate-200">
          <img
            src={scan.gradcam_image_url || scan.image_url}
            alt="Grad-CAM heatmap overlay"
            className="max-h-80 w-full object-cover"
          />
        </div>
      </Card>

      <Card className="flex gap-3 border-indigo-100 bg-indigo-50/50">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <Lightbulb className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">AI Insight</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{scan.insight}</p>
        </div>
      </Card>

      <MedicalDisclaimer />

      {showGradcamFull && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close full image"
            onClick={() => setShowGradcamFull(false)}
          />
          <img
            src={scan.gradcam_image_url || scan.image_url}
            alt="Full Grad-CAM visualization"
            className="relative max-h-[90vh] max-w-full rounded-xl object-contain"
          />
        </div>
      )}

      <div className="flex gap-3">
        <Button onClick={() => navigate('/upload')}>Upload Another Scan</Button>
        <Button variant="secondary" onClick={() => navigate(`/assistant?scan=${scan.id}`)}>
          <MessageCircle className="h-4 w-4" aria-hidden />
          Ask the Assistant
        </Button>
        <Link
          to="/history"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to History
        </Link>
      </div>
    </div>
  )
}
