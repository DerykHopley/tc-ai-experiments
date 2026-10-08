import type { ScatterPanel } from './tsne-scatter.ts';

// Facts about each person, keyed by name, used to describe what the neighbours have in common
export type Tags = Record<string, { field: string; gender: string }>;
export type Trait = 'field' | 'gender';

export type TraitScore = {
  model: string;
  share: number; // fraction of closest neighbours that share the trait
};

export type Comparison = {
  models: string[];
  k: number; // neighbours per person
  agreement: number[][]; // [i][j] = average neighbours models i and j share, 0..k
  stability: { name: string; agreement: number }[]; // 0..1, least stable first
  traits: Record<Trait, { chance: number; scores: TraitScore[] }>;
};

const countShared = (a: string[], b: string[]) =>
  a.filter((name) => b.includes(name)).length;

export function compareModels(panels: ScatterPanel[], tags: Tags): Comparison {
  const models = panels.map((panel) => panel.title);
  const names = panels[0].points.map((point) => point.name);
  const k = panels[0].points[0].neighbors.length;

  // neighbours[model index] -> name -> closest names
  const neighbours = panels.map(
    (panel) =>
      new Map(
        panel.points.map((point) => [
          point.name,
          point.neighbors.map((n) => n.name),
        ])
      )
  );
  const average = (values: number[]) =>
    values.reduce((sum, v) => sum + v, 0) / values.length;

  const agreement = neighbours.map((a) =>
    neighbours.map((b) =>
      average(names.map((name) => countShared(a.get(name)!, b.get(name)!)))
    )
  );

  // Every pair of different models, e.g. [0, 1], [0, 2], [1, 2]
  const pairs = models.flatMap((_, i) =>
    models.map((_, j) => [i, j]).filter(([a, b]) => a < b)
  );
  const stability = names
    .map((name) => ({
      name,
      agreement:
        pairs.length === 0
          ? 1
          : average(
              pairs.map(
                ([i, j]) =>
                  countShared(
                    neighbours[i].get(name)!,
                    neighbours[j].get(name)!
                  ) / k
              )
            ),
    }))
    .sort((a, b) => a.agreement - b.agreement || a.name.localeCompare(b.name));

  const traitSummary = (trait: Trait) => {
    // How often two different people picked at random share the trait
    const chance = average(
      names.map(
        (name) =>
          names.filter(
            (other) =>
              other !== name && tags[other][trait] === tags[name][trait]
          ).length /
          (names.length - 1)
      )
    );
    const scores = models.map((model, i) => ({
      model,
      share: average(
        names.map(
          (name) =>
            neighbours[i]
              .get(name)!
              .filter((other) => tags[other][trait] === tags[name][trait])
              .length / k
        )
      ),
    }));
    return { chance, scores };
  };

  return {
    models,
    k,
    agreement,
    stability,
    traits: { field: traitSummary('field'), gender: traitSummary('gender') },
  };
}
