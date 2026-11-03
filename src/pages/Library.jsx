import { Navigate } from 'react-router-dom'

// The library now lives inside the Profile page.
export default function Library() {
  return <Navigate to="/profile?tab=library" replace />
}
