import { DndContext, closestCenter } from '@dnd-kit/core'
import KanbanColumn from './KanbanColumn'

const STAGES = ['Applied', 'Phone Screen', 'Technical', 'Onsite', 'Offer', 'Rejected']

export default function KanbanBoard({ applications, onMove }) {
  const grouped = STAGES.reduce((acc, stage) => {
    acc[stage] = applications.filter((a) => a.stage === stage)
    return acc
  }, {})

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return
    const newStage = over.id
    if (active.data.current?.stage !== newStage) {
      onMove(active.id, newStage)
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <KanbanColumn key={stage} stage={stage} cards={grouped[stage] ?? []} />
        ))}
      </div>
    </DndContext>
  )
}
