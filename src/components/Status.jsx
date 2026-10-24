export default function Status({ status }) {
  return <span className={`status status-${String(status).toLowerCase()}`}>{status}</span>
}
