import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Chat from './components/Chat'
import VoiceChat from './components/Realtime'
import Layout from './components/Layout'

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <VoiceChat />
      },
      {
        path: "/chat",
        element: <Chat />
      }
    ]
  }
])

function App() {
  return (
    <RouterProvider router={router} />
  )
}

export default App
