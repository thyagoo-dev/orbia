import Header from '@/components/Header'
import AgendaPanel from '@/features/agenda/AgendaPanel'
import BillsPanel from '@/features/bills/BillsPanel'
import RemindersPanel from '@/features/reminders/RemindersPanel'

export default function Dashboard() {
  return (
    <div className="orbia-shell bg-app">
      <Header />

      <main className="orbia-dashboard mx-auto grid w-full max-w-[1680px] grid-cols-1 gap-5 px-4 pb-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:pb-6">
        <section className="orbia-agenda-column min-w-0 lg:col-span-8 xl:col-span-9">
          <AgendaPanel />
        </section>

        <aside className="orbia-sidebar min-w-0 lg:col-span-4 xl:col-span-3">
          <BillsPanel />
          <RemindersPanel />
        </aside>
      </main>
    </div>
  )
}
