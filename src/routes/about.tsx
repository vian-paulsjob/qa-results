import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <section className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">About</h1>
        <p className="mt-3 text-slate-600">
          QA Results Viewer runs on TanStack Start and reads case artifacts from
          the configured <code>CASES_DIR</code>.
        </p>
      </section>
    </main>
  )
}
