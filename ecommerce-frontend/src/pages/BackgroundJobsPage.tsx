import { useQuery } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, responseData } from '@/api/client'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/utils'
import type { BackgroundJob } from '@/types/models'

export function BackgroundJobsPage() {
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => responseData<BackgroundJob[]>(await api.get('/jobs/')),
    refetchInterval: (query) => query.state.data?.some((job) => job.status === 'queued' || job.status === 'running') ? 1500 : false,
  })
  const jobs = jobsQuery.data ?? []

  async function downloadInvoice(job: BackgroundJob) {
    if (!job.resource_id) return
    try {
      const response = await api.get(`/jobs/invoices/${job.resource_id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data as Blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `invoice-${job.resource_id}.pdf`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <main className="account-page jobs-page">
      <div className="account-page-heading">
        <div><p className="eyebrow"><span className="eyebrow-line" /> Work in progress</p><h1>Background jobs</h1></div>
        <Button variant="outline" onClick={() => void jobsQuery.refetch()}><RefreshCw size={14} /> Refresh</Button>
      </div>
      {jobsQuery.error && <div className="notice notice-error" role="alert">{errorMessage(jobsQuery.error)}</div>}
      {jobsQuery.isPending ? <div className="route-loading">Loading your jobs...</div> : jobs.length ? (
        <section className="background-job-list" aria-label="Background job history">
          {jobs.map((job) => {
            const result = job.result ?? {}
            const title = job.task_type === 'invoice' ? `Invoice for order #${job.resource_id}` : 'Product CSV import'
            return (
              <article className="background-job-card" key={job.id}>
                <div className="background-job-heading">
                  <div><h2>{title}</h2><p>{new Date(job.created_at).toLocaleString()}</p></div>
                  <span className={`job-status ${job.status}`}>{job.status}</span>
                </div>
                <div className="job-progress-label"><span>{job.status === 'completed' ? 'Complete' : job.status === 'failed' ? 'Stopped' : 'Progress'}</span><b>{Math.max(0, Math.min(100, job.progress))}%</b></div>
                <progress aria-label={`${title} progress`} max="100" value={job.progress} />
                {job.error && <p className="form-message error-text" role="alert">{job.error}</p>}
                {job.task_type === 'product_import' && job.status === 'completed' && (
                  <p className="job-result">Imported {String(result.imported ?? 0)} of {String(result.processed ?? 0)} rows{Number(result.error_count) > 0 ? ` · ${String(result.error_count)} row errors (see details below)` : ''}</p>
                )}
                {job.task_type === 'invoice' && job.status === 'completed' && <Button size="sm" onClick={() => void downloadInvoice(job)}><Download size={14} /> Download PDF invoice</Button>}
                {job.task_type === 'product_import' && Array.isArray(result.errors) && result.errors.length > 0 && (
                  <details className="job-error-details"><summary>Show first {result.errors.length} skipped rows</summary><ul>{result.errors.map((error, index) => <li key={`${job.id}-${index}`}>{String(error)}</li>)}</ul></details>
                )}
                {job.task_type === 'invoice' && job.status === 'completed' && result.total_amount !== undefined && <p className="job-result">Total: {formatPrice(Number(result.total_amount))}</p>}
              </article>
            )
          })}
        </section>
      ) : <div className="empty-state cart-empty"><h2>No background jobs yet.</h2><p>Generated invoices and admin CSV imports will appear here with live progress updates.</p></div>}
    </main>
  )
}
