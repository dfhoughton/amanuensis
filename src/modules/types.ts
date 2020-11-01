export interface PhraseRecord {

}

export interface CitationRecord {

}

export interface SourceRecord {

}

export type KeyPair = [realmKey: number, phraseKey: number]

export interface NoteRecord {
    phrase: PhraseRecord,
    realm: number,
    note: string,
    tags: string[],
    citations: CitationRecord[],
    relations: { [name: string]: KeyPair[] },
    starred: boolean,
    source: SourceRecord
}

export interface RealmInfo {
    pk: number,                    // the primary key (unique identifier) of the realm
    description: string,           // a description of the realm's contents
    normalizer: string,            // the name of the Normalizer the realm uses
    relations: [string, string][], // the relations the realm recognizes
}

export type RealmIdentifier = string | number | RealmInfo;

export interface Normalizer {
    name: string,
    description: string,
    code: (phrase: string) => string,
}
