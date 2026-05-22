import { useEffect, useMemo, useState } from 'react'
import { appRoutes } from '@/app/routes'

const getPathname = () =>
  typeof window === 'undefined' ? '/' : window.location.pathname || '/'

export default function App() {
  const [pathname, setPathname] = useState(getPathname)

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getPathname())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const Page = useMemo(() => {
    return appRoutes.find((route) => route.path === pathname)?.element ?? appRoutes[0].element
  }, [pathname])

  return <Page />
}
