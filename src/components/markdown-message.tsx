import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components:Components={
  a({node:_node,href,children,...props}){
    const external=Boolean(href&&/^https?:\/\//i.test(href));
    return <a
      {...props}
      href={href}
      target={external?"_blank":undefined}
      rel={external?"noopener noreferrer":undefined}
    >{children}</a>;
  },
  table({node:_node,children,...props}){
    return <div className="markdown-table-scroll"><table {...props}>{children}</table></div>;
  },
};

export default function MarkdownMessage({content}:{content:string}){
  return <div className="markdown-content">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {content}
    </ReactMarkdown>
  </div>;
}
