export interface FirestoreCollectionSnapshotMetadata {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export function aggregateFirestoreSnapshotMetadata(
  collectionSnapshots: Iterable<FirestoreCollectionSnapshotMetadata>,
  allCollectionsLoaded: boolean,
): FirestoreCollectionSnapshotMetadata {
  const snapshots = [...collectionSnapshots];
  return {
    fromCache: !allCollectionsLoaded || snapshots.some((snapshot) => snapshot.fromCache),
    hasPendingWrites: snapshots.some((snapshot) => snapshot.hasPendingWrites),
  };
}