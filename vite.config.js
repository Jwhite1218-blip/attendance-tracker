import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One id per deploy: Netlify sets COMMIT_REF during builds; local builds get a
// timestamp so two of them never look identical. The same id is baked into the
// bundle (__BUILD_ID__) and published as /version.json, so an open tab can ask
// "am I still the deployed version?" and reload itself when it isn't.
const buildId = process.env.COMMIT_REF || `local-${Date.now()}`

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId }),
        })
      },
    },
  ],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
})
