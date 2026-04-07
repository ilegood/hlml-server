const sidebar = document.getElementById("sidebar");
const trigger = document.getElementById("trigger");

trigger.addEventListener("mouseenter", () => {
  sidebar.classList.add("open");
});

trigger.addEventListener("mouseleave", () => {
  sidebar.classList.remove("open");
});
