// Synthetic catalog using the game's domains/families response shape.
export const familyCatalog = {
  domains: [
    {
      id: "objects",
      name: "Objects",
      families: [{ id: "objects.ships", name: "Ships and Boats" }],
    },
    {
      id: "animals",
      name: "Animals",
      families: [
        { id: "animals.fish", name: "Fish" },
        { id: "animals.waterfowl", name: "Ducks, Geese and Swans" },
      ],
    },
    {
      id: "arts",
      name: "Arts",
      families: [
        { id: "arts.pop-singers", name: "Pop Singers" },
        { id: "arts.animated-films", name: "Animated Films" },
        { id: "arts.cinema", name: "Cinéma" },
      ],
    },
  ],
};
