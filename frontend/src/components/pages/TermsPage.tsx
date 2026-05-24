import { MarkdownPage } from '../MarkdownPage';
import content from '../../pages/TermsOfService.md?raw';

export default function TermsPage() {
  return <MarkdownPage content={content} />;
}
