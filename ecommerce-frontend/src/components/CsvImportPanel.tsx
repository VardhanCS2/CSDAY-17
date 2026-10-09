import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api, errorMessage, responseData } from '@/api/client'
import { Button } from '@/components/ui/button'
import { addBackgroundJobToCache } from '@/lib/background-jobs'
import type { BackgroundJob } from '@/types/models'

export function CsvImportPanel() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const importMutation = useMutation({
    mutationFn: async (csv: File) => {
      const data = new FormData()
      data.append('file', csv)
      return api.post('/jobs/imports/products', data)
    },
    onSuccess: async (response) => {
      const job = responseData<BackgroundJob>(response)
      addBackgroundJobToCache(queryClient, job)
      setFile(null)
      const input = document.getElementById('product-csv-file')
      if (input instanceof HTMLInputElement) input.value = ''
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'products'] }),
      ])
      toast.success('CSV import started. Track its progress in Background jobs.')
      navigate('/jobs')
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!file) {
      setError('Choose a CSV file to import.')
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 10 * 1024 * 1024) {
      setError('Choose a CSV file no larger than 10 MB.')
      return
    }
    importMutation.mutate(file, {
      onError: (requestError) => setError(errorMessage(requestError)),
    })
  }

  return (
    <section className="csv-import-panel" aria-labelledby="csv-import-title">
      <div><p className="eyebrow"><span className="eyebrow-line" /> Bulk catalog updates</p><h2 id="csv-import-title">Import products from CSV</h2><p className="summary-note">Required columns: name, price, stock. Optional: description and image_url (an absolute image URL). Maximum file size: 10 MB.</p></div>
      <form onSubmit={submit}>
        <label className="file-input-wrap"><FileUp size={15} /><input id="product-csv-file" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small>{file?.name ?? 'Choose a CSV file'}</small></label>
        <Button type="submit" disabled={importMutation.isPending}>{importMutation.isPending ? 'Starting...' : 'Start import'}</Button>
      </form>
      {error && <p className="form-message error-text" role="alert">{error}</p>}
    </section>
  )
}
