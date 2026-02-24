import { Skeleton } from "@/components/ui/Skeleton"

export default function Loading() {
  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <Skeleton className="h-10 w-[300px] mb-2" />
          <Skeleton className="h-4 w-[500px]" />
        </header>

        <div className="w-full h-[600px] bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex gap-4">
                   <Skeleton className="h-8 w-[200px]" />
                   <Skeleton className="h-8 w-[150px]" />
                </div>
                <Skeleton className="h-8 w-[300px]" />
            </div>
            <Skeleton className="flex-1 w-full rounded-lg" />
        </div>

        <section className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 border border-slate-200 dark:border-slate-800">
          <Skeleton className="h-6 w-[200px] mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </section>
      </div>
    </main>
  )
}
