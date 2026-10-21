export function residentOwnsJob(residentId: string, job: { resident_id: string | null } | null): boolean {
  return !!job && job.resident_id === residentId;
}