---
layout: post
title:  "Component Generation with Figma API: Bridging the Gap Between Development and Design"
date:   2024-06-10
categories: jekyll update
---

## Introduction 
In today's fast-paced software development landscape, efficient workflows and clear responsibilities between development and design teams are crucial. One effective way to streamline these workflows is by automating component generation from design tools like [Figma](https://www.figma.com/) to code using powerful programming languages like [Golang](https://go.dev/). This article will explore the process of converting Figma components to code, focusing on the clear differentiation of responsibilities between development and design teams.

## Understanding the Need for Component Generation
Component generation is a vital aspect of modern software development. Automating this process, particularly converting Figma to code, offers numerous benefits, including increased efficiency and consistency. Figma, a popular design tool, plays a significant role in bridging the gap between design and development.

## Introduction to Figma API
The [Figma API](https://www.figma.com/developers/api) allows developers to programmatically access and manipulate design data. This functionality is crucial for converting Figma to code, enabling seamless integration and collaboration between design and development teams.

## Setting Up Your Development Environment
I chose Golang for interacting with the Figma API because its standard library offers powerful tools for tasks such as string manipulation and handling HTTP requests. Therefore, to run the example code provided in this post, you'll need to install Go. Additionally, having a Figma account is essential for generating the API key required to access the REST API.

## Writing the Golang Code for Figma API Integration
This section delves into the structure and details of the Golang code required to integrate with the Figma API. By understanding each part of the code, you'll be well-equipped to automate the conversion from Figma to code.

### Extracting Design Components from Figma
Accessing Figma components through the API and processing the design data are pivotal steps in the automation process for developers. This data extraction serves as the bedrock for effectively converting Figma designs into code. To retrieve component data, you can use the following endpoint: `/v1/files/:key/nodes?ids=component_id`. Upon a successful request, the API will return a JSON structure fully detailed on the documentation page.

In Go, the [`encoding/json`](https://pkg.go.dev/encoding/json) module provides tools for serializing and deserializing JSON data. In this article, the code presented serves as a simplified example to illustrate code generation methods. The accompanying types are intentionally crafted with only the necessary fields to showcase a minimal working example.

```go
type LayoutMode string
type ItemType string

type Color struct {
	Red   float64 `json:"r"`
	Green float64 `json:"g"`
	Blue  float64 `json:"b"`
	Alpha float64 `json:"a"`
}

type Fill struct {
	Color Color `json:"color"`
}

type Style struct {
	FontWeight   float64 `json:"fontWeight"`
	FontSize     float64 `json:"fontSize"`
	LineHeightPx float64 `json:"lineHeightPx"`
}

type AbsoluteBoundingBox struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type Document struct {
	Name                string              `json:"name"`
	Children            []Document          `json:"children"`
	Type                ItemType            `json:"type"`
	Characters          string              `json:"characters"`
	LayoutMode          LayoutMode          `json:"layoutMode"`
	AbsoluteBoundingBox AbsoluteBoundingBox `json:"absoluteBoundingBox"`
	Style               Style               `json:"style"`
	PaddingLeft         float64             `json:"paddingLeft"`
	PaddingRight        float64             `json:"paddingRight"`
	PaddingTop          float64             `json:"paddingTop"`
	PaddingBottom       float64             `json:"paddingBottom"`
	CornerRadius        float64             `json:"cornerRadius"`
	ItemsSpacing        float64             `json:"itemSpacing"`
	BackgroundColor     Color               `json:"backgroundColor"`
	Fills               []Fill              `json:"fills"`
}

type Node struct {
	Document Document `json:"document"`
}

type Component struct {
	Name  string          `json:"name"`
	Nodes map[string]Node `json:"nodes"`
}
```

`LayoutMode` and `ItemType` can take just certain string values. That is why they were defined as separate types. That allows to define how they should be parsed. For example, the following code defines parsing of the layout mode:

```go
func (s *LayoutMode) UnmarshalJSON(data []byte) error {
	var temp string
	if err := json.Unmarshal(data, &temp); err != nil {
		return err
	}

	candidate := LayoutMode(temp)
	if !candidate.IsValid() {
		return errors.New("Invalid layout mode")
	}

	*s = candidate
	return nil
}

func (s LayoutMode) IsValid() bool {
	switch s {
	case HorizontalLayout, VerticalLayout:
		return true
	}
	return false
}
```

### Generating QML Components from Design Data
QML is a markup language used in UI development. By mapping Figma components to QML, you can automate the generation of QML code from Figma data, facilitating a smooth transition from design to code.

**Analogy**: Think of the process like translating a recipe (Figma design) into a shopping list and cooking instructions (QML code). The ingredients (design elements) and steps (code) must match perfectly for the dish (application) to turn out as intended.

The following is an example code how to generate QML component from the deserialized JSON data:

```go
func generate(el Document, level int) string {
	switch el.Type {
	case ComponentType, FrameType:
		return generateComponent(el, level)
	case TextType:
		return generateText(el, level)
	}
	return ""
}

func GenerateQml(component Component) (string, error) {
	for _, value := range component.Nodes {
		doc := value.Document
		return fmt.Sprintf(`import QtQuick
import QtQuick.Layouts
%s `,
			generate(doc, 0)), nil
	}

	return "", nil
}
```

In this scenario, specific functions are executed based on the item type (e.g., frame, text, etc.) to convert Figma properties into corresponding QML properties. For instance, Figma's "`itemsSpacing`" is mapped to QML's "`Layout.spacing`", and so forth. Admittedly, there's a more sophisticated approach available: creating distinct structs for each item type and implementing the visitor pattern. However, such a solution would necessitate adjustments to the parser's logic, which is deemed unnecessary for this illustrative example.

You can find the complete code used in this article [here](https://github.com/krjakbrjak/figma_playground).

## Conclusion
Clear roles and responsibilities are essential for successful collaboration. Tools and processes that automate component generation from Figma to code significantly enhance teamwork and productivity. UI/UX developers can focus on creating designs and prototypes. And software developers can generate code (QML, React, etc.) from created Figma design files.
**Statistic**: A [study](https://www.mckinsey.com/capabilities/mckinsey-design/our-insights/tapping-into-the-business-value-of-design) by McKinsey found that companies with strong design and development collaboration can achieve revenue gains of up to 32%.

## FAQs
1. _What is the Figma API, and how does it work with code generation?_
The Figma API allows developers to access and manipulate design files programmatically. When integrated with code generation, it facilitates the extraction of design components and their conversion into code, streamlining the workflow from design to code.
2. _How can automated component generation benefit my project?_
Automated component generation can significantly reduce development time, enhance consistency across the application, and improve collaboration between design and development teams, leading to a more efficient and productive workflow.
3. _What are the security considerations when using APIs like Figma?_
Security considerations include ensuring proper authentication and authorization mechanisms, handling sensitive data securely, and following best practices for API usage to protect against vulnerabilities and breaches.
4. _Can this approach be scaled for larger projects?_ Yes, this approach can be scaled for larger projects. By following best practices for scalability and performance, you can extend the functionality and manage the increased complexity as your project grows.
