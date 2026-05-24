import { MarkdownPage } from '../MarkdownPage';
import content from '../../pages/CommunityGuidelines.md?raw';

export default function CommunityGuidelinesPage() {
  return <MarkdownPage content={content} />;
}
