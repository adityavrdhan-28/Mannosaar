import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.mannosaar.com').replace(/\/$/, '');

const publicPages: MetadataRoute.Sitemap = [
  { url: siteUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  { url: `${siteUrl}/services`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  { url: `${siteUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
  { url: `${siteUrl}/blogs`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  { url: `${siteUrl}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  { url: `${siteUrl}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  { url: `${siteUrl}/refund-policy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
];

interface PublishedBlog {
  slug: string;
  updated_at: string | null;
  created_at: string | null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return publicPages;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: blogs, error } = await supabase
      .from('blogs')
      .select('slug, updated_at, created_at')
      .eq('is_published', true);

    if (error || !blogs) {
      return publicPages;
    }

    const blogPages = (blogs as PublishedBlog[])
      .filter((blog) => blog.slug)
      .map((blog) => ({
        url: `${siteUrl}/blogs/${encodeURIComponent(blog.slug)}`,
        lastModified: new Date(blog.updated_at || blog.created_at || Date.now()),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));

    return [...publicPages, ...blogPages];
  } catch (error) {
    console.error('Unable to build the blog sitemap:', error);
    return publicPages;
  }
}
