export type TemplateType = 'standard' | 'cornell' | 'lecture' | 'flashcards';

export interface TemplateOptions {
  type: TemplateType;
  title: string;
  sourceUrl?: string;
  tags?: string[];
  duration?: string;
}

export function generateTemplate(options: TemplateOptions): string {
  const { type, title, sourceUrl, tags = ['video-notes'], duration } = options;
  const isoDate = new Date().toISOString().split('T')[0];

  const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: "${isoDate}"
source: "${sourceUrl || ''}"
${duration ? `duration: "${duration}"\n` : ''}tags:
${tags.map((t) => `  - ${t}`).join('\n')}
---

`;

  switch (type) {
    case 'cornell':
      return (
        frontmatter +
        `# ${title}

## 🎯 Cues & Questions
- *Key questions to test recall*
- [00:00] Initial thesis or topic introduction

---

## 📝 Lecture Notes
- *Detailed study notes with timestamps and snapshots*

---

## 💡 Summary (Bottom Line)
> [!abstract] Key Takeaway
> Write a 2-3 sentence core synthesis of the lecture here.
`
      );

    case 'lecture':
      return (
        frontmatter +
        `# ${title}

> [!info] Lecture Metadata
> **Source**: [Watch Video](${sourceUrl || '#'})
> **Date**: ${isoDate}

## 📌 Executive Overview


## 🔑 Core Concepts & Timestamps


## 💻 Code, Diagrams & Formulas


## 🏁 Key Takeaways
- 
`
      );

    case 'flashcards':
      return (
        frontmatter +
        `# Flashcards: ${title}

TARGET DECK: VideoStudyNotes

### Question 1::Answer 1
<!-- [00:00] -->

### Question 2::Answer 2
`
      );

    case 'standard':
    default:
      return (
        frontmatter +
        `# ${title}

`
      );
  }
}
