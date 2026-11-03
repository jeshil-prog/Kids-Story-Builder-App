import { Navigate } from 'react-router-dom'

// Friends now lives inside the Profile page.
export default function Friends() {
  return <Navigate to="/profile?tab=friends" replace />
}
