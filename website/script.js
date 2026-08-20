const onionLessons = [
  {
    eyebrow: "First clue · the filesystem’s identity card",
    title: "The superblock tells us how to read everything else.",
    body:
      "At exactly byte 1024 from the beginning of an ext4 filesystem lives its superblock. This is the first fixed landmark we can trust before we know anything else. It records the block size, how many inodes and blocks exist, how many blocks belong in a group, and how large each group descriptor is. In ext4/superblock.go, we read this structure, check its ext4 magic number, and derive the geometry needed for every later calculation.",
    source: "ext4/superblock.go → ReadSuperBlock()",
  },
  {
    eyebrow: "Second clue · the filesystem’s neighborhood map",
    title: "Group descriptors tell us where each group keeps its records.",
    body:
      "A large ext4 filesystem is divided into block groups so its bookkeeping is local rather than one huge, unwieldy table. The group descriptor table has one descriptor per group. Each descriptor points to that group’s inode table and its allocation bitmaps. Once we have the superblock’s block size and descriptor size, ext4/group_descr.go can calculate and read this table.",
    source: "ext4/group_descr.go → ReadGroupDescriptors()",
  },
  {
    eyebrow: "Third clue · the record behind a file name",
    title: "The inode table contains the facts about each file.",
    body:
      "Directory entries merely connect a visible name to an inode number. An inode is the record at that number: it describes the file type, size, times, permissions, and its map to content. To read inode 108, we determine its block group, ask that group descriptor where the inode table starts, and stride through fixed-size inode records until we reach the right one.",
    source: "ext4/inode.go → ReadInode()",
  },
  {
    eyebrow: "Final clue · the bytes we came to find",
    title: "Data blocks hold directory entries and file contents.",
    body:
      "The inode tells us how to locate the file’s data. Modern ext4 commonly uses extents, compact records mapping a consecutive run of logical file blocks to a consecutive run of physical disk blocks. We follow the extent tree in ext4/extent.go, then ext4/file.go uses that map to return precisely the requested range of bytes.",
    source: "ext4/extent.go → ReadExtents(); ext4/file.go → ReadFileAt()",
  },
];
const onionCard = document.querySelector("#onionCard");
const onionProgress = document.querySelector("#onionProgress");
function showOnionLayer(index) {
  const lesson = onionLessons[index];
  document.querySelectorAll(".onion-layer").forEach((item) =>
    item.classList.toggle("active", Number(item.dataset.layer) === index)
  );
  onionCard.animate([{ opacity: .2, transform: "translateY(10px)" }, {
    opacity: 1,
    transform: "translateY(0)",
  }], { duration: 260, easing: "ease-out" });
  onionCard.innerHTML =
    `<p class="card-kicker">${lesson.eyebrow}</p><h3>${lesson.title}</h3><p>${lesson.body}</p><p class="file-ref">In the code: <strong>${lesson.source}</strong></p>`;
  onionProgress.textContent = `${index + 1} of ${onionLessons.length}`;
}
document.querySelectorAll(".onion-layer").forEach((button) =>
  button.addEventListener(
    "click",
    () => showOnionLayer(Number(button.dataset.layer)),
  )
);
document.querySelectorAll(".onion-label").forEach((label) =>
  label.addEventListener("click", () => {
    showOnionLayer(Number(label.dataset.layer));
  })
);
document.querySelector("#onionPrev").addEventListener("click", () => {
  const current = Number(
    document.querySelector(".onion-layer.active").dataset.layer,
  );
  showOnionLayer((current + onionLessons.length - 1) % onionLessons.length);
});
document.querySelector("#onionNext").addEventListener("click", () => {
  const current = Number(
    document.querySelector(".onion-layer.active").dataset.layer,
  );
  showOnionLayer((current + 1) % onionLessons.length);
});

const reads = [
  {
    title: "Read 1 : begin at the one address ext4 promises",
    offset: "partition offset + 1024 bytes",
    code: "fs.ReadSuperBlock()\n→ dev.ReadAt(superblockBuffer, 1024)",
    bytes:
      "00 00 00 00  00 80 00 00  00 04 00 00  00 40 00 00\n00 20 00 00  00 00 00 00  02 00 00 00  00 80 00 00\n… 53 EF …",
    explain:
      "We ask our ReaderAt for 1024 bytes beginning at filesystem offset 1024. The highlighted-looking 53 EF bytes are the ext4 magic number when stored in little-endian order. The decoded fields tell us, for this example, that blocks are 4096 bytes and that each group has 8192 inodes.",
  },
  {
    title: "Read 2 : use the new geometry to find the GDT",
    offset: "block 1 × 4096 = filesystem byte 4096",
    code: "fs.ReadGroupDescriptors()\n→ dev.ReadAt(descriptorBuffer, 4096)",
    bytes:
      "08 00 00 00  09 00 00 00  0A 00 00 00  20 7F 00 00\n00 20 00 00  00 00 00 00  00 00 00 00  00 00 00 00",
    explain:
      "Now the superblock has made “block 1” meaningful. We read the group descriptor table and decode one descriptor for each block group. In this toy group 0 descriptor, the inode table begins at physical filesystem block 10.",
  },
  {
    title: "Read 3 : calculate the precise inode-record address",
    offset:
      "inode table block 10 × 4096 + local inode index 105 × 256 = 67,840",
    code:
      "inodeOffset := tableStart + localIndex * InodeSize\nfs.dev.ReadAt(inodeBuffer, inodeOffset)",
    bytes:
      "A4 81 00 00  00 10 00 00  82 B1 2A 66  82 B1 2A 66\n82 B1 2A 66  00 00 00 00  00 00 01 00  08 00 00 00",
    explain:
      "Suppose the directory entry named hello.txt pointed to inode 106. Inode numbers begin at one, so its zero-based local index in this group is 105. The inode record says this is a regular file, gives its size and timestamps, and contains the start of its extent tree.",
  },
  {
    title: "Read 4 : translate a file block through an extent",
    offset: "extent says logical block 0 → physical block 812",
    code:
      "extents, _ := fs.ReadExtents(inode)\nphysicalOffset := 812 * fs.BlockSize",
    bytes:
      "0A F3 01 00  04 00 00 00  00 00 00 00\n00 00 00 00  04 00 2C 03  00 00 00 00",
    explain:
      "The inode’s embedded extent node starts with the magic 0xF30A. Its leaf extent says that four logical blocks beginning at file block 0 live beginning at physical filesystem block 812. We can now turn a request inside the file into a concrete disk offset.",
  },
  {
    title: "Read 5 : bring back only the requested file bytes",
    offset: "physical block 812 × 4096 + requested offset",
    code:
      "fs.ReadFileAt(extents, fileSize, buffer, offset)\n→ PartitionReader.ReadAt(buffer, absoluteOffset)",
    bytes:
      "48 65 6C 6C  6F 2C 20 66  69 6C 65 73  79 73 74 65\n6D 73 21 0A  00 00 00 00  00 00 00 00  00 00 00 00",
    explain:
      "Those bytes decode as “Hello, filesystems!\n”. Before the underlying disk is touched, PartitionReader adds the partition start offset and confirms that this request stays inside the partition. That small boundary check keeps an ext4 parser from accidentally reading a neighboring partition.",
  },
];
const byteView = document.querySelector("#byteView");
document.querySelectorAll("#readerTabs button").forEach((button) =>
  button.addEventListener("click", () => {
    const read = reads[button.dataset.read];
    document.querySelectorAll("#readerTabs button").forEach((item) =>
      item.classList.remove("active")
    );
    button.classList.add("active");
    byteView.animate([{ opacity: .2 }, { opacity: 1 }], { duration: 220 });
    byteView.innerHTML =
      `<p class="byte-title">${read.title}</p><p class="byte-offset">READ AT: ${read.offset}</p><pre class="code-line">${read.code}</pre><pre class="hex">${read.bytes}</pre><p>${read.explain}</p>`;
  })
);
document.querySelector("#readerTabs button").click();

const nodes = {
  root: { name: "/", inode: 2, children: ["home", "etc", "readme.md"] },
  home: { name: "home", inode: 14, children: ["ada", "guest"] },
  ada: { name: "ada", inode: 108, children: ["hello.txt", "projects"] },
  projects: { name: "projects", inode: 219, children: ["filesystem.go"] },
  etc: { name: "etc", inode: 35, children: ["hosts"] },
};
let route = ["root"];
const crumbs = document.querySelector("#crumbs"),
  tree = document.querySelector("#tree"),
  pathOutput = document.querySelector("#pathOutput");
function drawPath() {
  const current = nodes[route.at(-1)];
  crumbs.innerHTML = route.map((id, i) =>
    `<button class="crumb ${
      i === route.length - 1 ? "active" : ""
    }" data-i="${i}">${nodes[id].name}</button>`
  ).join("");
  tree.innerHTML =
    (current.children || []).map((name) =>
      `<button class="node ${
        nodes[name] ? "folder" : "file"
      }" data-name="${name}">${name}</button>`
    ).join("") || "<i>This file has no children.</i>";
  pathOutput.innerHTML =
    `You are looking at directory <b>${current.name}</b>, inode <b>${current.inode}</b>. Its data block contains entries pairing names with inode numbers.`;
  crumbs.querySelectorAll("button").forEach((b) =>
    b.onclick = () => {
      route = route.slice(0, +b.dataset.i + 1);
      drawPath();
    }
  );
  tree.querySelectorAll(".node").forEach((b) =>
    b.onclick = () => {
      const name = b.dataset.name;
      if (nodes[name]) {
        route.push(name);
        drawPath();
      } else {pathOutput.innerHTML =
          `The directory entry for <b>${name}</b> points to its inode. We would now load that inode, follow its extents, and read the file bytes.`;}
    }
  );
}
drawPath();
const slider = document.querySelector("#blockSlider"),
  logical = document.querySelector("#logical"),
  physical = document.querySelector("#physical"),
  blocks = document.querySelector("#blocks"),
  extentOutput = document.querySelector("#extentOutput");
function drawExtent() {
  const n = +slider.value,
    base = n < 3 ? 812 : 991,
    start = n < 3 ? 0 : 3,
    phys = base + n - start;
  logical.textContent = n;
  physical.textContent = phys;
  blocks.innerHTML = [0, 1, 2, 3, 4, 5].map((i) =>
    `<span class="block ${i === n ? "active" : ""}"></span>`
  ).join("");
  extentOutput.textContent =
    `Logical block ${n} is read from physical disk block ${phys}. ${
      n < 3
        ? "The first extent covers blocks 0–2."
        : "The second extent covers blocks 3–5, so the physical run jumps."
    }`;
}
slider.oninput = drawExtent;
drawExtent();
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.animate([{ opacity: 0, transform: "translateY(22px)" }, {
          opacity: 1,
          transform: "none",
        }], {
          duration: 550,
          fill: "forwards",
          easing: "cubic-bezier(.2,.7,.2,1)",
        });
        observer.unobserve(entry.target);
      }
    }),
  { threshold: .12 },
);
document.querySelectorAll(".reveal").forEach((el) => {
  el.style.opacity = 0;
  observer.observe(el);
});

function initCourseProgress() {
  const chapters = [...document.querySelectorAll(".course-chapter")];
  const links = [...document.querySelectorAll("[data-course-link]")];
  const rail = document.querySelector("#courseRail");

  function showActiveChapter(chapterNumber) {
    links.forEach((link) =>
      link.classList.toggle(
        "active",
        Number(link.dataset.courseLink) === chapterNumber,
      )
    );
    rail.style.setProperty(
      "--course-progress",
      `${(chapterNumber / chapters.length) * 100}%`,
    );
  }

  const chapterObserver = new IntersectionObserver(
    (entries) => {
      const visibleChapter = entries.find((entry) => entry.isIntersecting);
      if (visibleChapter) {
        showActiveChapter(Number(visibleChapter.target.dataset.course));
      }
    },
    { rootMargin: "-30% 0px -60%", threshold: 0 },
  );

  chapters.forEach((chapter) => chapterObserver.observe(chapter));
  showActiveChapter(1);
}

initCourseProgress();

const themeToggle = document.querySelector("#themeToggle");
function setTheme(isDark, persist = true) {
  document.body.classList.toggle("night", isDark);
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute(
    "aria-label",
    isDark ? "Enable light mode" : "Enable dark mode",
  );
  themeToggle.querySelector("b").textContent = isDark
    ? "Light mode"
    : "Dark mode";
  themeToggle.querySelector("span").textContent = isDark ? "◑" : "◐";
  if (persist) {
    localStorage.setItem("janus-theme", isDark ? "dark" : "light");
  }
}
const storedTheme = localStorage.getItem("janus-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
setTheme(storedTheme ? storedTheme === "dark" : prefersDark, false);
themeToggle.addEventListener(
  "click",
  () => setTheme(!document.body.classList.contains("night")),
);
