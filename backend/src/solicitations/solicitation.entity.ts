import {
  Column,
  Entity,
  type EntityManager,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Archive } from '../ingest/archive.entity.js';
import type { IndexRow } from '../ingest/dibbs.js';

// The spec's M2 records for one RFQ. All four entities live in this file: split files that import each
// other hit a circular import through decorator metadata under ESM.

/**
 * What parser/parse.js returns for one RFQ PDF (see test/fixtures/*.json). Only the paths storeRfq()
 * reads are typed; the rest is kept as is in Solicitation.data.
 */
export type RfqJson = {
  solicitation: {
    number: string;
    issue_date?: string | null;
    quote_due_date?: string | null;
    purchase_request?: string | null;
  };
  issuing_office?: { lines?: string[] } | null;
  buyer?: { name?: string | null; code?: string | null } | null;
  items?: {
    description?: string | null;
    pr?: string | null;
    notes?: string[];
    requirement_codes?: { code: string }[];
    approved_sources?: { name: string; cage: string; part_number: string }[];
    clins?: {
      clin: string;
      nsn?: string | null;
      nomenclature?: string | null;
      quantity?: number | null;
      unit?: string | null;
      fob?: string | null;
      delivery_days_ado?: number | null;
      pr?: string | null;
    }[];
  }[];
  first_article?: unknown;
  procurement_history?: {
    nsn: string;
    cage: string | null;
    contract: string | null;
    quantity: number;
    unit_price: number;
    award_date: string;
    surplus: boolean;
  }[];
  [key: string]: unknown;
};

/** One RFQ (one PDF) of a DIBBS day. */
@Entity()
// archiveId first: the index also serves the foreign key, which SQLite doesn't index itself.
@Index(['archiveId', 'number'], { unique: true })
export class Solicitation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  archiveId: number;

  @ManyToOne(() => Archive, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'archiveId' })
  archive: Archive;

  /** e.g. SPE1C1-27-Q-0018 */
  @Column()
  number: string;

  /** T or U: DIBBS automated (U = indefinite delivery); Q: manual. */
  @Column()
  type: string;

  @Column({ type: 'date', nullable: true })
  issueDate: string | null;

  /** From the daily index when it lists the RFQ: a re-posted RFQ keeps its old date in the PDF. */
  @Column({ type: 'date', nullable: true })
  quoteDueDate: string | null;

  @Column({ type: 'varchar', nullable: true })
  office: string | null;

  @Column({ type: 'varchar', nullable: true })
  buyer: string | null;

  @Column({ type: 'varchar', nullable: true })
  buyerCode: string | null;

  /** The daily index's set-aside code: N for none, Y small business, H, L, R, E other set-aside types. */
  @Column({ type: 'varchar', nullable: true })
  setAside: string | null;

  /** Acquisition Method Suffix Code (AMSC), from the daily index. */
  @Column({ type: 'varchar', nullable: true })
  amsc: string | null;

  @Column()
  firstArticle: boolean;

  /** Data class: CUI or export-controlled technical data applies, so its data must never leave the host. */
  @Column()
  controlled: boolean;

  /** Of the PDF it was parsed from; null for the demo seed. */
  @Column({ type: 'varchar', nullable: true })
  sha256: string | null;

  @Column()
  parserVersion: number;

  /** The parser's whole output, so nothing is lost. Left out of lists (~22 KB each). */
  @Column({ type: 'simple-json', select: false })
  data: RfqJson;

  @OneToMany(() => Line, (line) => line.solicitation, { cascade: true })
  lines: Line[];
}

/** One CLIN: the unit a vendor quotes. */
@Entity()
@Index(['solicitationId', 'clin'], { unique: true })
export class Line {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  solicitationId: number;

  @ManyToOne(() => Solicitation, (s) => s.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitationId' })
  solicitation: Solicitation;

  @Column()
  clin: string;

  @Column({ type: 'varchar', nullable: true })
  nsn: string | null;

  @Column({ type: 'varchar', nullable: true })
  nomenclature: string | null;

  @Column({ type: 'real', nullable: true })
  quantity: number | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  /** Days after award (ADO). */
  @Column({ type: 'integer', nullable: true })
  deliveryDays: number | null;

  @Column({ type: 'varchar', nullable: true })
  fob: string | null;

  @Column({ type: 'varchar', nullable: true })
  purchaseRequest: string | null;

  @OneToMany(() => ApprovedSource, (source) => source.line, { cascade: true })
  sources: ApprovedSource[];
}

/** A source DLA approves for a line's item. */
@Entity()
export class ApprovedSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  lineId: number;

  @ManyToOne(() => Line, (line) => line.sources, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lineId' })
  line: Line;

  @Column()
  cage: string;

  @Column()
  partNumber: string;

  @Column()
  name: string;
}

/**
 * A past award for an NSN, from an RFQ's procurement history. Every later RFQ for the NSN prints it
 * again; the unique key keeps one row (two CLINs of one contract differ in quantity or price).
 */
@Entity()
@Index(['nsn', 'awardDate', 'contract', 'quantity', 'unitPrice'], {
  unique: true,
})
export class AwardHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  nsn: string;

  @Column({ type: 'date' })
  awardDate: string;

  /** '' when DIBBS prints none: NULLs never collide in a unique key, so repeats would pile up. */
  @Column()
  contract: string;

  /** The awardee; null when DIBBS prints "NOT FO(UND)". */
  @Column({ type: 'varchar', nullable: true })
  cage: string | null;

  @Column({ type: 'real' })
  quantity: number;

  @Column({ type: 'real' })
  unitPrice: number;

  @Column()
  surplus: boolean;

  /** The first RFQ that reported it. */
  @Index()
  @Column()
  solicitationId: number;

  @ManyToOne(() => Solicitation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitationId' })
  solicitation: Solicitation;
}

/** Saves one parsed RFQ with its lines, approved sources and award history. */
export async function storeRfq(
  em: EntityManager,
  archiveId: number,
  data: RfqJson,
  index: IndexRow | undefined,
  provenance: { sha256: string | null; parserVersion: number },
) {
  const s = data.solicitation;
  const items = data.items ?? [];
  const codes = items
    .flatMap((i) => i.requirement_codes ?? [])
    .map((r) => r.code);
  const { id } = await em.save(
    Object.assign(new Solicitation(), {
      archiveId,
      number: s.number,
      type: s.number.split('-')[2],
      issueDate: s.issue_date ?? null,
      quoteDueDate: index?.quoteDueDate ?? s.quote_due_date ?? null,
      office: data.issuing_office?.lines?.[0] ?? null,
      buyer: data.buyer?.name ?? null,
      buyerCode: data.buyer?.code ?? null,
      setAside: index?.setAside ?? null,
      amsc: index?.amsc ?? null,
      firstArticle: !!data.first_article,
      // DLA's CUI markers, or a restrictive distribution statement on the item.
      controlled:
        codes.includes('RD002') ||
        codes.includes('RQ032') ||
        items.some((i) =>
          i.notes?.some((n) => /DISTRIBUTION STATEMENT [B-F]\b/.test(n)),
        ),
      ...provenance,
      data,
      lines: items.flatMap((item) =>
        (item.clins ?? []).map((c) =>
          Object.assign(new Line(), {
            clin: c.clin,
            nsn: c.nsn ?? null,
            // T and U RFQs leave the CLIN's nomenclature empty and name the item in its description.
            nomenclature: c.nomenclature ?? item.description ?? null,
            quantity: c.quantity ?? null,
            unit: c.unit ?? null,
            deliveryDays: c.delivery_days_ado ?? null,
            fob: c.fob ?? null,
            purchaseRequest: c.pr ?? item.pr ?? s.purchase_request ?? null,
            sources: (item.approved_sources ?? []).map((a) =>
              Object.assign(new ApprovedSource(), {
                cage: a.cage,
                partNumber: a.part_number,
                name: a.name,
              }),
            ),
          }),
        ),
      ),
    }),
  );
  const history = (data.procurement_history ?? []).map((h) => ({
    nsn: h.nsn,
    awardDate: h.award_date,
    contract: h.contract ?? '',
    cage: h.cage,
    quantity: h.quantity,
    unitPrice: h.unit_price,
    surplus: h.surplus,
    solicitationId: id,
  }));
  if (history.length)
    await em
      .createQueryBuilder()
      .insert()
      .into(AwardHistory)
      .values(history)
      .orIgnore()
      .execute();
}
