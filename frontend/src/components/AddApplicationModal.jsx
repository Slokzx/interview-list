import { useState } from 'react'

const STAGES = ['Applied', 'Phone Screen', 'Technical', 'Onsite', 'Offer', 'Rejected']

export default function AddApplicationModal({ onClose, onSave }) {
  const [form, setForm] = useState({ company: '', role: '', stage: 'Applied', notes: '' })

  function handleSubmit(e) {
    e.preventDefault()
    onSave(form)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Application</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            required
            placeholder="Company"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
          <input
            required
            placeholder="Role"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.stage}
            onChange={(e) => setForm({ ...form, stage: e.target.value })}
          >
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <textarea
            placeholder="Notes (optional)"
            rows={3}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
