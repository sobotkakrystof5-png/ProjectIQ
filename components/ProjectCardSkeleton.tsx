export function ProjectCardSkeleton() {
  return (
    <div className="bg-surface border border-navy-100 rounded-chip p-5 animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="h-4 bg-navy-50 rounded w-2/3 mb-2" />
          <div className="h-3 bg-navy-50 rounded w-1/2" />
        </div>
        <div className="h-5 bg-navy-50 rounded-full w-20" />
      </div>
      <div className="h-3 bg-navy-50 rounded w-full mb-3" />
      <div className="h-1.5 bg-navy-50 rounded-full mb-4" />
      <div className="flex gap-4">
        <div className="h-3 bg-navy-50 rounded w-16" />
        <div className="h-3 bg-navy-50 rounded w-20" />
      </div>
    </div>
  )
}
