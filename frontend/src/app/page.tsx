import Canvas from '@/components/Canvas'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4">
      <div className="w-full max-w-7xl">
        <h1 className="text-4xl font-bold text-center mb-8">
          Canvas Colaborativo
        </h1>
        <Canvas />
      </div>
    </main>
  )
}
