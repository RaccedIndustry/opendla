import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Archive } from '../ingest/archive.entity.js';

/**
 * What rfq2json.js produces for one RFQ PDF (see SPE1C127Q0018.json in the
 * repo root). Only the paths Rfq.from() reads are typed; the rest is kept as is.
 */
export type RfqJson = {
  solicitation: {
    number: string;
    quote_due_date?: string | null;
    small_business_set_aside?: boolean | null;
  };
  issuing_office?: { lines?: string[] } | null;
  buyer?: { name?: string | null } | null;
  items?: {
    description?: string | null;
    clins?: {
      nsn?: string | null;
      nomenclature?: string | null;
      quantity?: number | null;
      unit?: string | null;
      fob?: string | null;
    }[];
  }[];
  [key: string]: unknown;
};

/** One RFQ (one PDF) from a daily archive. */
@Entity()
// archiveId first: the index also serves the foreign key, which SQLite doesn't index itself.
@Index(['archiveId', 'number'], { unique: true })
export class Rfq {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  archiveId: number;

  @ManyToOne(() => Archive, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'archiveId' })
  archive: Archive;

  /** Solicitation number, e.g. SPE1C1-27-Q-0018. */
  @Column()
  number: string;

  // Copied from `data` by from() so lists can show and filter them without parsing JSON.
  @Column({ type: 'date', nullable: true })
  quoteDueDate: string | null;

  @Column({ type: 'boolean', nullable: true })
  setAside: boolean | null;

  @Column({ type: 'varchar', nullable: true })
  office: string | null;

  @Column({ type: 'varchar', nullable: true })
  buyer: string | null;

  // ponytail: first CLIN only; the full-text search covers the others
  @Column({ type: 'varchar', nullable: true })
  nsn: string | null;

  @Column({ type: 'varchar', nullable: true })
  item: string | null;

  @Column({ type: 'real', nullable: true })
  quantity: number | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({ type: 'varchar', nullable: true })
  fob: string | null;

  /** The parser's whole output, so nothing is lost. Left out of lists (~22 KB each). */
  @Column({ type: 'simple-json', select: false })
  data: RfqJson;

  static from(archiveId: number, data: RfqJson) {
    const first = data.items?.[0];
    const clin = first?.clins?.[0];
    return Object.assign(new Rfq(), {
      archiveId,
      number: data.solicitation.number,
      quoteDueDate: data.solicitation.quote_due_date ?? null,
      setAside: data.solicitation.small_business_set_aside ?? null,
      office: data.issuing_office?.lines?.[0] ?? null,
      buyer: data.buyer?.name ?? null,
      nsn: clin?.nsn ?? null,
      // T and U RFQs leave the CLIN's nomenclature empty and name the item in its description.
      item: clin?.nomenclature ?? first?.description ?? null,
      quantity: clin?.quantity ?? null,
      unit: clin?.unit ?? null,
      fob: clin?.fob ?? null,
      data,
    });
  }
}
