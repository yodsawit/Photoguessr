import { cn } from '../lib/utils'
import { DotBackground } from './ui/DotBackground'

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <DotBackground />
      {children}
    </div>
  )
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full max-w-md rounded-3xl border border-sand bg-white/90 p-6 text-center shadow-[0_20px_50px_-20px_rgba(120,90,60,0.35)] backdrop-blur-sm', className)}>
      {children}
    </div>
  )
}

export function CenteredPage({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10">{children}</main>
      <FooterLinks />
    </Shell>
  )
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'sage' | 'coral' | 'quiet' }

export function Button({ tone = 'sage', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'h-12 w-full rounded-2xl font-bold shadow-sm transition active:scale-[0.98] disabled:opacity-60',
        tone === 'sage' && 'bg-sage-deep text-white hover:brightness-105',
        tone === 'coral' && 'bg-coral text-white hover:brightness-105',
        tone === 'quiet' && 'border border-sand bg-white text-ink hover:bg-cream',
        className,
      )}
      {...props}
    />
  )
}

export function Title({ children }: { children?: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-extrabold tracking-tight text-ink">
      Photo<span className="text-coral">Guessr</span>
      {children && <span className="block text-base font-bold text-muted">{children}</span>}
    </h1>
  )
}

export function FooterLinks() {
  return (
    <nav className="flex justify-center gap-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs font-semibold text-muted">
      <a href="/" className="px-2 py-3 hover:text-ink">
        Play
      </a>
      <a href="/admin" className="px-2 py-3 hover:text-ink">
        Create album
      </a>
    </nav>
  )
}
