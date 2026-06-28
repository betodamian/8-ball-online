import Room from "@/components/Room";
import { normalizeCode } from "@/lib/ids";

export default function PlayPage({ params }: { params: { code: string } }) {
  return <Room code={normalizeCode(params.code)} />;
}
