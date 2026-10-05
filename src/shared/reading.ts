import { z } from 'zod';
export const readingSchema = z.object({
  title: z.string().max(500),
  blocks: z
    .array(
      z.object({ kind: z.enum(['heading', 'paragraph', 'quote']), text: z.string().max(3000) }),
    )
    .max(200),
});
export type ReadingArticle = z.infer<typeof readingSchema> & { url: string };
