(() => {
  const contents = document.querySelector(".legal-toc-inner");
  const desktop = matchMedia("(min-width: 900px)");
  const setLayout = () => {
    contents.open = desktop.matches;
  };
  setLayout();
  desktop.addEventListener("change", setLayout);
})();
