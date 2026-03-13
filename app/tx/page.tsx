import { redirect } from "next/navigation"

/** Legacy route: Tx Console is now Wallet Activity at /activity. Developer Tx Builder lives at /tx/console. */
export default function TxPage() {
  redirect("/activity")
}
