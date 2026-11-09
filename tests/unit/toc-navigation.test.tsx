import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown, slugifyHeading } from '@/components/editor/utils/markdown-serializer';

describe('Table of Contents & Heading Anchors', () => {
  const sampleMarkdown = `# My Project Documentation

## Table of Contents
* [1. Introduction](#1-introduction)
* [2. Installation Quickstart](#2-installation-quickstart)
    * [2.1 Prerequisites](#21-prerequisites)
    * [2.2 Configuration](#22-configuration)
* [3. Frequently Asked Questions](#3-frequently-asked-questions)

---

## 1. Introduction
This is where your main introduction content goes.

## 2. Installation Quickstart
Step-by-step setup guides go right here.

### 2.1 Prerequisites
Make sure you have the required software installed before continuing.

### 2.2 Configuration
Adjust your environment variables here.

## 3. Frequently Asked Questions
Find answers to common project troubleshooting issues.`;

  it('generates matching anchor IDs for Table of Contents items', () => {
    const html = markdownToHtml(sampleMarkdown);

    // Verify TOC links
    expect(html).toContain('<a href="#1-introduction">1. Introduction</a>');
    expect(html).toContain('<a href="#2-installation-quickstart">2. Installation Quickstart</a>');
    expect(html).toContain('<a href="#21-prerequisites">2.1 Prerequisites</a>');
    expect(html).toContain('<a href="#22-configuration">2.2 Configuration</a>');
    expect(html).toContain('<a href="#3-frequently-asked-questions">3. Frequently Asked Questions</a>');

    // Verify Heading IDs
    expect(html).toContain('<h2 id="1-introduction">1. Introduction</h2>');
    expect(html).toContain('<h2 id="2-installation-quickstart">2. Installation Quickstart</h2>');
    expect(html).toContain('<h3 id="21-prerequisites">2.1 Prerequisites</h3>');
    expect(html).toContain('<h3 id="22-configuration">2.2 Configuration</h3>');
    expect(html).toContain('<h2 id="3-frequently-asked-questions">3. Frequently Asked Questions</h2>');
  });

  it('slugifyHeading generates clean slugs matching standard anchor links', () => {
    expect(slugifyHeading('1. Introduction')).toBe('1-introduction');
    expect(slugifyHeading('2. Installation Quickstart')).toBe('2-installation-quickstart');
    expect(slugifyHeading('2.1 Prerequisites')).toBe('21-prerequisites');
    expect(slugifyHeading('2.2 Configuration')).toBe('22-configuration');
    expect(slugifyHeading('3. Frequently Asked Questions')).toBe('3-frequently-asked-questions');
  });

  it('roundtrips Table of Contents markdown losslessly', () => {
    const html = markdownToHtml(sampleMarkdown);
    const md = htmlToMarkdown(html);

    expect(md).toContain('[1. Introduction](#1-introduction)');
    expect(md).toContain('[2. Installation Quickstart](#2-installation-quickstart)');
    expect(md).toContain('[2.1 Prerequisites](#21-prerequisites)');
    expect(md).toContain('[2.2 Configuration](#22-configuration)');
    expect(md).toContain('[3. Frequently Asked Questions](#3-frequently-asked-questions)');
    expect(md).toContain('## 1. Introduction');
    expect(md).toContain('## 2. Installation Quickstart');
    expect(md).toContain('### 2.1 Prerequisites');
    expect(md).toContain('### 2.2 Configuration');
    expect(md).toContain('## 3. Frequently Asked Questions');
  });
});
