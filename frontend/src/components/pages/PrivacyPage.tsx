import { MarkdownPage } from '../MarkdownPage';
import content from '../../pages/PrivacyPolicy.md?raw';

export default function PrivacyPage() {
  return <MarkdownPage content={content} />;
}
