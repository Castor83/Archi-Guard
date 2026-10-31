import { Plugin } from '@opencode/plugin'
import { setupGuard } from './runtime.mjs'

export default Plugin.define({
  id: 'archi.guard.global',
  setup: setupGuard
})
