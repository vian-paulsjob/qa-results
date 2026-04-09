import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import ThemeToggle from '#/components/ThemeToggle'
import { TooltipProvider } from '#/components/ui/tooltip'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'QA Test Result' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" prefix="og: https://ogp.me/ns#">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var m=(t==='dark'||t==='light')?t:p;document.documentElement.classList.toggle('dark',m==='dark');document.documentElement.style.colorScheme=m;}catch(e){}})();",
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        <TooltipProvider delay={120}>
          <div className="fixed top-4 right-4 z-[60]">
            <ThemeToggle />
          </div>
          {children}
        </TooltipProvider>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'TanStack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
