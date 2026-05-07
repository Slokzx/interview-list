import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import ApplicationCard from './ApplicationCard'

const STAGE_COLORS = {
  Applied: 'bg-blue-100 text-blue-800',
  'Phone Screen': 'bg-yellow-100 text-yellow-800',
  Technical: 'bg-purple-100 text-purple-800',
  Onsite: 'bg-orange-100 text-orange-800',
  Offer: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
}

export default function KanbanColumn({ stage, cards }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-xl p-3 transition-colors ${
        isOver ? 'bg-slate-200' : 'bg-slate-100'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STAGE_COLORS[stage]}`}>
          {stage}
        </span>
        <span className="text-xs text-slate-400">{cards.length}</span>
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 min-h-[120px]">
          {cards.map((card) => (
            <ApplicationCard key={card.id} application={card} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
