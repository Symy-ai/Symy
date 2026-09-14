import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'dev-secret-change-in-production',
  admin: {
    user: 'users',
    importMap: {
      baseDir: path.resolve(__dirname),
    },
  },
  routes: {
    admin: '/cms',
  },
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    push: false,
  }),
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    {
      slug: 'posts',
      admin: {
        useAsTitle: 'title',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: true,
        },
        {
          name: 'excerpt',
          type: 'textarea',
        },
        {
          name: 'content',
          type: 'richText',
        },
        {
          name: 'category',
          type: 'select',
          options: [
            { label: 'Algorithm Decode', value: 'algorithm-decode' },
            { label: 'Anti-Inducement', value: 'anti-inducement' },
            { label: 'Product Update', value: 'product-update' },
          ],
        },
        {
          name: 'status',
          type: 'select',
          defaultValue: 'draft',
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'Pending Review', value: 'pending' },
            { label: 'Published', value: 'published' },
          ],
        },
        {
          name: 'locale',
          type: 'select',
          options: [
            { label: 'English', value: 'en' },
            { label: '中文', value: 'zh' },
          ],
          defaultValue: 'en',
        },
        {
          name: 'seoTitle',
          type: 'text',
        },
        {
          name: 'seoDescription',
          type: 'textarea',
        },
        {
          name: 'publishedAt',
          type: 'date',
        },
      ],
    },
  ],
  typescript: {
    outputFile: path.resolve(__dirname, 'src/payload-types.ts'),
  },
});
