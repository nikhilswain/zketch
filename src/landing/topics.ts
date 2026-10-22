export interface TopicSection {
  heading: string;
  body: string;
  art: string;
}

export interface TopicQuestion {
  q: string;
  a: string;
  link?: { href: string; label: string };
}

export interface Topic {
  slug: string;
  link: string;
  title: string;
  description: string;
  tape: string;
  h1: string;
  sub: string;
  sections: TopicSection[];
  questions: TopicQuestion[];
  og: string[];
}

export const TOPICS: Topic[] = [
  {
    slug: "flowchart-maker",
    link: "hand-drawn flowcharts",
    title: "Hand-drawn flowchart maker, free online | zketch",
    description:
      "Draw flowcharts and diagrams that look hand-drawn: boxes, diamonds and arrows that stick to shapes, five sketchy looks and text labels. Free, no sign-up.",
    tape: "free · no sign-up · sketchy on purpose",
    h1: "A hand-drawn flowchart maker for quick diagrams.",
    sub: "Sketch a flowchart, a system diagram or a plan on a whiteboard that never runs out of room. Boxes, diamonds and circles with a hand-drawn look, and arrows that stay stuck to them.",
    sections: [
      {
        heading: "boxes, diamonds and arrows that keep up.",
        body: "Drag out rectangles, circles, diamonds and triangles, then connect them. Arrows and lines attach to the shapes they point at, so moving a box drags its arrows along. Bend an arrow, change its heads, or give it a label.",
        art: "mini-diagram",
      },
      {
        heading: "five looks, from tidy to scribbly.",
        body: "Switch a diagram between Clean, Sketchy, Pencil, Crayon and Charcoal. Sketchy diagrams look like a whiteboard drawing, which keeps people talking about the idea instead of the alignment.",
        art: "paper-plane",
      },
      {
        heading: "write on anything.",
        body: "Type text anywhere on the page, or straight inside a shape to label it. Then mix in freehand doodles, highlighter and text on the same page, because real diagrams are never only boxes.",
        art: "rocket",
      },
      {
        heading: "share it or export it.",
        body: "Export a PNG or JPG for a doc or a slide, or share a link that replays the diagram being drawn, which is a nice way to walk someone through a flow.",
        art: "share-arrow",
      },
    ],
    questions: [
      {
        q: "Is there a simple, whiteboard-style mode?",
        a: "Yes. The Simple layout hides the panels and gives you one floating toolbar, with number keys for each tool and a small card for colours and line styles.",
      },
      {
        q: "Can I make flowcharts for free?",
        a: "Yes. zketch is free, with no account and no limit on the number of diagrams.",
      },
      {
        q: "Do arrows stay connected when I move shapes?",
        a: "Yes. An arrow that ends on a shape stays attached to it while you move or resize the shape.",
      },
      {
        q: "Can I export a diagram as SVG?",
        a: "Not yet. PNG and JPG export work today, and SVG is planned.",
      },
      {
        q: "Can several people edit one diagram together?",
        a: "Not yet. zketch is a personal sketchpad for now: you draw, then share a link.",
      },
    ],
    og: ["A hand-drawn", "flowchart maker", "for quick diagrams."],
  },
  {
    slug: "excalidraw-alternative",
    link: "Excalidraw alternative",
    title: "A hand-drawn Excalidraw alternative with brushes | zketch",
    description:
      "Like Excalidraw but want real brushes? zketch has sketchy diagrams and arrows that stick, plus pencil, watercolor, layers and replays. Free, no sign-up.",
    tape: "free · open source · no sign-up",
    h1: "An Excalidraw alternative with real brushes.",
    sub: "If you love Excalidraw's hand-drawn diagrams but want to paint, layer and doodle on the same page, zketch might be your thing. Here is an honest look at both.",
    sections: [
      {
        heading: "the same sketchy diagrams.",
        body: "Rectangles, diamonds, circles and arrows with a hand-drawn look, arrows that stick to shapes, and text inside shapes. If you draw quick flowcharts in Excalidraw, you will feel at home.",
        art: "mini-diagram",
      },
      {
        heading: "simple when you want it.",
        body: "The Simple layout tucks every panel away and leaves one floating toolbar, a small card for colours and line styles, and a number key for each tool. When it is time to paint, bring the panels back or drag them to whichever side suits you.",
        art: "layout",
      },
      {
        heading: "plus brushes you can paint with.",
        body: "Excalidraw has one freehand pen. zketch has over thirty brushes: pencil with paper grain, ink, watercolor, gouache, oil, charcoal, crayon and nature brushes. Diagrams can even be drawn in Pencil, Crayon or Charcoal.",
        art: "brush-jar",
      },
      {
        heading: "layers and a replay.",
        body: "Keep the diagram, the doodles and the colour on separate layers. And because zketch remembers every stroke, any drawing can replay itself, so a shared link shows how the idea came together.",
        art: "film-replay",
      },
      {
        heading: "when Excalidraw is the better pick.",
        body: "If you need to draw live with teammates, use shape libraries, export SVG or edit on a phone, Excalidraw does those today and zketch does not. Both are free, open source and need no account, so try both.",
        art: "share-arrow",
      },
    ],
    questions: [
      {
        q: "Is zketch free like Excalidraw?",
        a: "Yes. zketch is free and open source (MIT), with no account and no paid tier.",
      },
      {
        q: "Can I import Excalidraw files?",
        a: "Not today. zketch imports images and its own .zketch backup files.",
      },
      {
        q: "Does zketch have live collaboration?",
        a: "No. You can share a read-only link that replays the drawing, and choose whether people can copy it into their own zketch.",
      },
      {
        q: "Where are my drawings stored?",
        a: "In your browser, like Excalidraw's local mode. Nothing is uploaded unless you share a drawing.",
      },
    ],
    og: ["An Excalidraw", "alternative with", "real brushes."],
  },
  {
    slug: "brushes",
    link: "36 textured brushes",
    title: "Online drawing brushes: pencil, watercolor, oil | zketch",
    description:
      "Paint online with 36 textured brushes: pencil with paper grain, watercolor, gouache, charcoal, oil, palette knife and nature brushes that plant trees. Free.",
    tape: "36 brushes · all free",
    h1: "Textured drawing brushes, right in your browser.",
    sub: "Most online drawing apps give you a round pen in different sizes. zketch has 36 brushes with real texture, from pencil and charcoal to watercolor, oil and a brush that plants a forest.",
    sections: [
      {
        heading: "dry media with real grain.",
        body: "Pencil catches the tooth of the paper, charcoal and pastel are grainy and broken, and wax crayon looks like the one from school. Pressure from a stylus or tablet changes size and strength.",
        art: "tree",
      },
      {
        heading: "wet paint that behaves.",
        body: "Watercolor is soft and see-through and layers like glazes. Gouache covers what is underneath. Oil, bristle, palette knife and wet flat brushes leave streaks and ridges like paint on canvas.",
        art: "flower",
      },
      {
        heading: "brushes that do the boring bits.",
        body: "Nature brushes plant pine trees, bushes, grass, leaves and clouds as you drag. Effects add sparkle, stars and water glints. Texture brushes add dust, scratches and splatter.",
        art: "pine-forest",
      },
    ],
    questions: [
      {
        q: "Do I need a drawing tablet?",
        a: "No. A mouse or trackpad works. A stylus or drawing tablet adds pressure, so lines get thicker and darker as you press.",
      },
      {
        q: "Can I import my own brushes?",
        a: "Not yet. Importing brushes is on the list.",
      },
      {
        q: "Where do the brushes come from?",
        a: "Some are built into zketch, and some are made from free brush packs by David Revoy, Dino0040 and RaV89, credited in the project.",
      },
    ],
    og: ["Textured brushes,", "right in your", "browser."],
  },
  {
    slug: "drawing-timelapse",
    link: "drawing timelapse",
    title: "Drawing timelapse maker: replay every stroke | zketch",
    description:
      "zketch remembers every stroke, so your drawing replays itself. Share a link people can scrub, embed it on your site, or download the timelapse as a video.",
    tape: "replay · share · save as video",
    h1: "A drawing timelapse, without a screen recorder.",
    sub: "zketch remembers every stroke you draw. Press play and watch the drawing come back, or share a link that replays it and save the timelapse as a video.",
    sections: [
      {
        heading: "every stroke, in order.",
        body: "Strokes are saved with their timing, so a drawing can replay itself stroke by stroke. Long pauses are squeezed out, and you can scrub to any moment or speed it up to 32 times.",
        art: "film-replay",
      },
      {
        heading: "share a link that plays.",
        body: "A share link opens a page where anyone can tap to watch the drawing happen, drag to scrub, and pick a speed. No app and no account needed to watch.",
        art: "share-arrow",
      },
      {
        heading: "save it as a video, or embed it.",
        body: "From a share link, download the timelapse as an MP4 (or WebM in browsers that cannot make MP4), made right in your browser. Or embed the replay on your own site with a copy-paste code, and it works with oEmbed too.",
        art: "rocket",
      },
    ],
    questions: [
      {
        q: "Do I need to record my screen?",
        a: "No. zketch records the strokes themselves, so the replay is crisp at any size and never shows your cursor or other windows.",
      },
      {
        q: "Can I replay an old drawing?",
        a: "Yes. Every drawing saved in zketch can replay, including ones you made before you knew it could.",
      },
      {
        q: "Is the shared replay public?",
        a: "Only people with the link can open it, and shared drawings are kept out of search engines. You can unshare any link from your vault.",
      },
    ],
    og: ["A drawing timelapse,", "without a screen", "recorder."],
  },
];

export const LANDING_QUESTIONS: TopicQuestion[] = [
  {
    q: "Is zketch free?",
    a: "Yes. Every brush and every feature is free, with no account, no watermark and no paid tier. zketch is open source under the MIT licence.",
  },
  {
    q: "Do I need to sign up?",
    a: "No. Open zketch and start drawing. There is nothing to install and no account to make.",
  },
  {
    q: "Where are my drawings saved?",
    a: "In your browser, on your device. Nothing is uploaded unless you share a drawing. Clearing your browser's site data deletes them, so save a .zketch backup file from your vault now and then.",
  },
  {
    q: "Can I make flowcharts and diagrams?",
    a: "Yes. Draw boxes, diamonds and circles, connect them with arrows that stay attached, label them, and pick a look from Clean to Charcoal.",
    link: { href: "/flowchart-maker", label: "More on hand-drawn flowcharts." },
  },
  {
    q: "How is zketch different from Excalidraw?",
    a: "Both do hand-drawn diagrams. zketch adds textured brushes, layers and replays; Excalidraw has live collaboration, shape libraries and SVG export.",
    link: { href: "/excalidraw-alternative", label: "See them side by side." },
  },
  {
    q: "Can I export or share a drawing?",
    a: "Export a PNG or JPG, or share a link that replays the drawing stroke by stroke. From a share link you can also download the replay as a video or embed it on a site.",
    link: { href: "/drawing-timelapse", label: "More on drawing timelapses." },
  },
  {
    q: "Does it work on a phone?",
    a: "zketch is made for tablets and computers. On a phone you can open shared drawings and watch them replay, but drawing needs a bigger screen.",
  },
];

export const BRUSH_GROUPS: { label: string; brushes: [key: string, name: string][] }[] = [
  {
    label: "draw",
    brushes: [
      ["pencil", "Pencil"],
      ["ink", "Ink"],
      ["marker", "Marker"],
      ["highlighter", "Highlighter"],
      ["calligraphy", "Calligraphy"],
      ["airbrush", "Airbrush"],
      ["charcoal", "Charcoal"],
      ["pastel", "Pastel"],
      ["crayon", "Wax Crayon"],
    ],
  },
  {
    label: "paint",
    brushes: [
      ["watercolor", "Watercolor"],
      ["gouache", "Gouache"],
      ["drybrush", "Dry Brush"],
      ["oil", "Oil Paint"],
      ["rake", "Bristle Rake"],
      ["flatbristle", "Flat Bristle"],
      ["knife", "Palette Knife"],
      ["smear", "Rough Smear"],
      ["softflat", "Soft Flat"],
      ["wetflat", "Wet Flat"],
    ],
  },
  {
    label: "texture",
    brushes: [
      ["splatter", "Splatter"],
      ["sponge", "Sponge"],
      ["dabs", "Impressionist"],
      ["streaks", "Streaks"],
      ["scratch", "Scratchy"],
      ["dust", "Dust"],
    ],
  },
  {
    label: "nature",
    brushes: [
      ["pine", "Pine"],
      ["forest", "Forest"],
      ["tree", "Bare Tree"],
      ["bush", "Bush"],
      ["foliage", "Foliage"],
      ["leaves", "Leaves"],
      ["grass", "Grass"],
      ["clouds", "Clouds"],
    ],
  },
  {
    label: "effects",
    brushes: [
      ["sparkle", "Sparkle"],
      ["stars", "Starfield"],
      ["glint", "Water Glints"],
    ],
  },
];

export function topicBySlug(slug: string): Topic {
  const topic = TOPICS.find((t) => t.slug === slug);
  if (!topic) throw new Error(`Unknown topic: ${slug}`);
  return topic;
}
