---
layout: page
title: About
permalink: /about/
---

Welcome to my blog! After many years of programming and exploring new technologies, I've realized how easy it is to forget interesting things I've learned or built. This blog is my way of giving more structure to those discoveries—whether it's a cool project, a useful tip, or something fascinating I stumbled upon.

Here you'll find posts about programming, tools, and anything else I find worth sharing. My goal is to document and share insights, both for my own reference and to help others who might find them useful.

Thanks for visiting, and I hope you find something interesting here!

## Open Source Contributions

{% assign contrib = site.data.contributions -%}
Besides my own projects, I try to give back to the open-source tools I rely on every day. When I hit a bug or a missing feature, I'd rather fix it upstream than quietly work around it. Here are some of the contributions I've made.

<div class="contrib-list">
{%- for project in contrib.projects %}
  <details class="contrib-project">
    <summary class="contrib-summary">
      <span class="contrib-repo">{{ project.owner }}/<strong>{{ project.name }}</strong></span>
      <span class="contrib-stat" title="{{ project.additions }} additions, {{ project.deletions }} deletions across {{ project.count }} PR{% if project.count != 1 %}s{% endif %}">
        <span class="contrib-lines"><span class="diff-add">+{{ project.additions_label }}</span> <span class="diff-del">&minus;{{ project.deletions_label }}</span></span>
        <span class="diff-bar" aria-hidden="true"><span class="diff-add">{{ project.plus_str }}</span><span class="diff-del">{{ project.minus_str }}</span></span>
      </span>
    </summary>
    <ul class="contrib-prs">
    {%- for pr in project.prs %}
      <li class="contrib-pr">
        <a class="contrib-pr-title" href="{{ pr.url }}" target="_blank" rel="noopener">{{ pr.title }}</a>
        <span class="contrib-pr-meta">
          <span class="contrib-lines"><span class="diff-add">+{{ pr.additions_label }}</span> <span class="diff-del">&minus;{{ pr.deletions_label }}</span></span>
          <span class="contrib-date">{{ pr.date }}</span>
        </span>
      </li>
    {%- endfor %}
    </ul>
  </details>
{%- endfor %}
</div>
