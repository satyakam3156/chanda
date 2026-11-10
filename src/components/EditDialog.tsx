import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ErrorText } from '@/components/forms'

/**
 * Shared add/edit dialog. onSave/onDelete return an error message or null.
 * Delete asks for a second tap instead of a browser confirm (works better on phones).
 */
export function EditDialog({
  open,
  onOpenChange,
  title,
  description,
  onSave,
  onDelete,
  saveLabel = 'Save',
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  onSave: () => Promise<string | null>
  onDelete?: () => Promise<string | null>
  saveLabel?: string
  children: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function change(next: boolean) {
    if (!next) {
      setError(null)
      setConfirmDelete(false)
    }
    onOpenChange(next)
  }

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    const err = await action()
    setBusy(false)
    if (err) setError(err)
    else change(false)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void run(onSave)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <ErrorText>{error}</ErrorText>
          <DialogFooter className="gap-2 sm:justify-between">
            {onDelete ? (
              <Button
                type="button"
                variant={confirmDelete ? 'destructive' : 'ghost'}
                disabled={busy}
                onClick={() => (confirmDelete ? void run(onDelete) : setConfirmDelete(true))}
              >
                {confirmDelete ? 'Tap again to delete' : 'Delete'}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
