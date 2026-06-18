"use client";

export type AssertionAssociation = {
  identityId: string;
  displayName: string;
  email: string | null;
};

type AssertionAssociationsProps = {
  associations: AssertionAssociation[];
};

export function AssertionAssociations({ associations }: AssertionAssociationsProps) {
  if (associations.length === 0) {
    return null;
  }

  return (
    <details className="assertion-associations">
      <summary aria-label={`${associations.length} associated ${associations.length === 1 ? "person" : "people"}`}>
        +{associations.length}
      </summary>
      <div className="assertion-associations-overlay">
        {associations.map((association) => (
          <div key={association.identityId} className="assertion-association-person">
            <strong>{association.displayName}</strong>
            {association.email ? <span>{association.email}</span> : null}
          </div>
        ))}
      </div>
    </details>
  );
}
