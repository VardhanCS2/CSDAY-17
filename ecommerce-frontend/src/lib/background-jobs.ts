import type { QueryClient } from '@tanstack/react-query'
import type { BackgroundJob } from '@/types/models'

const pendingNotificationsKey = 'pending_background_job_notifications'

function getPendingJobIds() {
  const saved = sessionStorage.getItem(pendingNotificationsKey)
  if (!saved) return new Set<string>()
  try {
    const parsed: unknown = JSON.parse(saved)
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    sessionStorage.removeItem(pendingNotificationsKey)
    return new Set<string>()
  }
}

function savePendingJobIds(ids: Set<string>) {
  if (ids.size) sessionStorage.setItem(pendingNotificationsKey, JSON.stringify([...ids]))
  else sessionStorage.removeItem(pendingNotificationsKey)
}

export function pendingBackgroundJobNotifications() {
  return getPendingJobIds()
}

export function acknowledgeBackgroundJobNotification(jobId: string) {
  const ids = getPendingJobIds()
  ids.delete(jobId)
  savePendingJobIds(ids)
}

export function addBackgroundJobToCache(queryClient: QueryClient, job: BackgroundJob) {
  const pending = getPendingJobIds()
  pending.add(job.id)
  savePendingJobIds(pending)
  queryClient.setQueryData<BackgroundJob[]>(['jobs'], (current) => [
    job,
    ...(current ?? []).filter((item) => item.id !== job.id),
  ])
}
