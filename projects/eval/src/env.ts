import { z } from "zod"

const Env = z.object({
  AI_GATEWAY_API_KEY: z.string(),
})

export const env = Env.parse(process.env)
