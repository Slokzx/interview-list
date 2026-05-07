import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function ApplicationCard({ application }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: application.id,
    data: { stage: application.stage },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const initials = application.company
    ? application.company.slice(0, 2).toUpperCase()
    : '??'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white rounded-lg p-3 shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
          {initials}
        </div>
        <span className="font-medium text-sm text-slate-800 truncate">{application.company}</span>
      </div>
      <p className="text-xs text-slate-500 truncate">{application.role}</p>
      {application.last_email_date && (
        <p className="text-xs text-slate-400 mt-1">
          {new Date(application.last_email_date).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}
