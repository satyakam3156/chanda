import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Stand-in for pages built in later steps, so the shell can be tested now. */
export function Placeholder({ step, title, points }: { step: number; title: string; points: string[] }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Coming in step {step}</p>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
