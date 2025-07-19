
export interface RecommendedReadingItem {
  id?: string;
  title: string;
  description: string;
  type: 'link' | 'file';
  url?: string;
  fileUrl?: string;
  fileName?: string;
  category?: string; // Optional to match database schema
}
