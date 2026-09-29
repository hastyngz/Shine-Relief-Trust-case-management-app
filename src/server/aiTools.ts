import { FunctionDeclaration, Type } from '@google/genai';
import {
  AppDatabase,
  Girl,
  Household,
  EducationalFollowUp,
  HealthFollowUp,
  FamilyFollowUp,
  HouseholdRentPayment,
  HouseholdExpense,
  HouseholdActivity,
} from '../types';
import { searchOperationalRecords } from '../services/intelligenceService';

/**
 * Controlled, read-only tools exposed to the Gemini model.
 * The model CANNOT construct arbitrary queries or execute write operations.
 */

export const AI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'searchGirls',
    description: 'Search for girls by name, case number, status, or school. Returns minimum required fields.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search term for girl name, case ID (e.g. "SG-001"), or keyword',
        },
        status: {
          type: Type.STRING,
          description: 'Filter by enrollment status: "Active", "Graduated", "Transferred", "Exited"',
        },
        school: {
          type: Type.STRING,
          description: 'Filter by school name',
        },
      },
    },
  },
  {
    name: 'getGirlProfile',
    description: 'Retrieve case profile for an individual girl by her unique girl ID or case ID (e.g. "SG-001").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        girlId: {
          type: Type.STRING,
          description: 'The unique girl identifier (e.g. "SG-001")',
        },
      },
      required: ['girlId'],
    },
  },
  {
    name: 'getGirlFollowUps',
    description: 'Retrieve historical follow-up visits (educational, health/medical, family/guardian) for a specific girl.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        girlId: {
          type: Type.STRING,
          description: 'The unique girl identifier (e.g. "SG-001")',
        },
        followUpType: {
          type: Type.STRING,
          description: 'Optional filter: "educational", "health", "family", or "all"',
        },
      },
      required: ['girlId'],
    },
  },
  {
    name: 'searchHouseholds',
    description: 'Search households by name, location, or status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search keyword for household name or location',
        },
        status: {
          type: Type.STRING,
          description: 'Filter by status: "Active" or "Inactive"',
        },
      },
    },
  },
  {
    name: 'getHouseholdProfile',
    description: 'Retrieve detailed profile for a SHINE household including capacity, occupants, and landlord info.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        householdId: {
          type: Type.STRING,
          description: 'The unique household ID (e.g. "HH-01")',
        },
      },
      required: ['householdId'],
    },
  },
  {
    name: 'getHouseholdFollowUps',
    description: 'Retrieve activities and records linked to a specific household.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        householdId: {
          type: Type.STRING,
          description: 'The unique household identifier',
        },
      },
      required: ['householdId'],
    },
  },
  {
    name: 'getRentRecords',
    description: 'Retrieve rent payment records for households, filterable by household ID, month, or year.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        householdId: {
          type: Type.STRING,
          description: 'Optional household ID filter (e.g. "HH-01")',
        },
        month: {
          type: Type.STRING,
          description: 'Optional month name (e.g. "September", "January")',
        },
        year: {
          type: Type.NUMBER,
          description: 'Optional year (e.g. 2026)',
        },
        status: {
          type: Type.STRING,
          description: 'Optional payment status: "Paid", "Partial", "Overdue"',
        },
      },
    },
  },
  {
    name: 'getHouseholdExpenses',
    description: 'Retrieve recorded household expenditures and utility costs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        householdId: {
          type: Type.STRING,
          description: 'Optional household ID filter',
        },
        month: {
          type: Type.STRING,
          description: 'Optional month name or YYYY-MM string',
        },
        year: {
          type: Type.NUMBER,
          description: 'Optional year filter',
        },
        category: {
          type: Type.STRING,
          description: 'Optional category (Food, Utilities, Maintenance, Medical, Education, Transport, Other)',
        },
      },
    },
  },
  {
    name: 'getGroupActivities',
    description: 'Retrieve group activities, workshops, and household gatherings conducted.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        householdId: {
          type: Type.STRING,
          description: 'Optional household ID filter',
        },
        month: {
          type: Type.STRING,
          description: 'Optional month filter',
        },
        year: {
          type: Type.NUMBER,
          description: 'Optional year filter',
        },
      },
    },
  },
  {
    name: 'getOutstandingFollowUps',
    description: 'Retrieve overdue follow-ups or upcoming follow-ups needing attention across educational, health, and family categories.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        overdueOnly: {
          type: Type.BOOLEAN,
          description: 'If true, returns only follow-ups where nextFollowUpDate is in the past and status is not Resolved',
        },
        daysAhead: {
          type: Type.NUMBER,
          description: 'Number of days ahead to look for upcoming follow-ups (default is 30)',
        },
        girlId: {
          type: Type.STRING,
          description: 'Optional filter for a specific girl',
        },
      },
    },
  },
  {
    name: 'getDashboardStatistics',
    description: 'Retrieve current operational summary metrics (total girls, school enrollments, active households, occupancy, overdue tasks).',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'getCaseActions',
    description: 'Read authorized open, overdue, completed, or high-priority case actions. Staff results are limited to their assigned actions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        girlId: { type: Type.STRING, description: 'Optional girl ID filter.' },
        householdId: { type: Type.STRING, description: 'Optional household ID filter.' },
        status: { type: Type.STRING, description: 'Optional status filter.' },
        overdueOnly: { type: Type.BOOLEAN, description: 'Return actions with due dates before today that are not completed or cancelled.' },
      },
    },
  },
  {
    name: 'getGirlEducationHistory',
    description: 'Summarize documented education history, academic support, and recorded examination results for a girl.',
    parameters: {
      type: Type.OBJECT,
      properties: { girlId: { type: Type.STRING, description: 'Girl ID.' } },
      required: ['girlId'],
    },
  },
  {
    name: 'getGirlsOnLeave',
    description: 'List recorded active temporary leave periods, expected return dates, and recorded reasons.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getUpcomingCaseReviews',
    description: 'List case reviews with a recorded upcoming next review date.',
    parameters: {
      type: Type.OBJECT,
      properties: { daysAhead: { type: Type.NUMBER, description: 'How many days ahead to include (default 30).' } },
    },
  },
  {
    name: 'searchOperationalRecords',
    description: 'Search authorized SHINE operational records including meetings, schedules, workplans, market prices, feeding logs, girls, and households.',
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: 'Natural-language search terms.' } },
      required: ['query'],
    },
  },
  {
    name: 'getReportData',
    description: 'Retrieve consolidated case-management figures for a specific month and year to assist with drafting monthly reports.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.STRING,
          description: 'Month name (e.g. "September", "August") or number (1-12)',
        },
        year: {
          type: Type.NUMBER,
          description: 'Calendar year (e.g. 2026)',
        },
      },
      required: ['month', 'year'],
    },
  },
];

/**
 * Controlled Executor for AI Tools
 */
export async function executeAITool(
  name: string,
  args: Record<string, any>,
  db: AppDatabase,
  accessedRecordIds: Set<string>
): Promise<any> {
  const todayStr = new Date().toISOString().split('T')[0];

  switch (name) {
    case 'searchOperationalRecords': {
      const results = searchOperationalRecords(db, String(args.query || ''));
      results.forEach((result) => accessedRecordIds.add(result.recordId));
      return results;
    }
    case 'searchGirls': {
      const q = (args.query || '').toLowerCase().trim();
      const status = args.status;
      const school = (args.school || '').toLowerCase().trim();

      const results = db.girls
        .filter((g) => {
          if (q) {
            const matchName = g.fullName.toLowerCase().includes(q);
            const matchId = g.id.toLowerCase().includes(q);
            if (!matchName && !matchId) return false;
          }
          if (status && g.status !== status) return false;
          if (school && !g.school.toLowerCase().includes(school)) return false;
          return true;
        })
        .map((g) => {
          accessedRecordIds.add(g.id);
          return {
            id: g.id,
            fullName: g.fullName,
            status: g.status,
            school: g.school,
            classLevel: g.classLevel,
            dateAdmitted: g.dateAdmitted,
            householdId: g.householdId,
            guardianName: g.guardianInfo?.name,
          };
        });

      return {
        count: results.length,
        girls: results.slice(0, 20),
      };
    }

    case 'getGirlProfile': {
      const targetId = (args.girlId || '').toLowerCase().trim();
      const girl = db.girls.find(
        (g) => g.id.toLowerCase() === targetId || g.fullName.toLowerCase().includes(targetId)
      );

      if (!girl) {
        return { error: `No girl found with ID or name matching "${args.girlId}".` };
      }

      accessedRecordIds.add(girl.id);

      // Find living arrangement
      const house = girl.householdId
        ? db.households.find((h) => h.id === girl.householdId)
        : null;

      return {
        id: girl.id,
        fullName: girl.fullName,
        dateOfBirth: girl.dateOfBirth,
        age: girl.dateOfBirth ? calculateAge(girl.dateOfBirth) : undefined,
        status: girl.status,
        school: girl.school,
        classLevel: girl.classLevel,
        dateAdmitted: girl.dateAdmitted,
        household: house ? { id: house.id, name: house.name, location: house.location } : 'None / Community based',
        guardian: {
          name: girl.guardianInfo?.name || 'Not provided',
          relationship: girl.guardianInfo?.relationship || 'Not provided',
          phone: girl.guardianInfo?.phone || 'None',
          villageOrLocation: girl.guardianInfo?.villageOrLocation || 'Not recorded',
          situationNotes: girl.guardianInfo?.situationNotes || '',
        },
        notes: girl.notes || 'None recorded',
      };
    }

    case 'getGirlFollowUps': {
      const targetId = (args.girlId || '').toLowerCase().trim();
      const girl = db.girls.find(
        (g) => g.id.toLowerCase() === targetId || g.fullName.toLowerCase().includes(targetId)
      );

      if (!girl) {
        return { error: `No girl found matching "${args.girlId}".` };
      }

      accessedRecordIds.add(girl.id);
      const type = (args.followUpType || 'all').toLowerCase();

      const edu = (type === 'all' || type === 'educational')
        ? db.educationalFollowUps
            .filter((e) => e.girlId === girl.id)
            .map((e) => {
              accessedRecordIds.add(e.id);
              return {
                id: e.id,
                date: e.date,
                school: e.school,
                classLevel: e.classLevel,
                academicIssue: e.academicIssue,
                problemsExperienced: e.problemsExperienced,
                subjectsNeedingSupport: e.subjectsNeedingSupport,
                supportProvided: e.supportProvided,
                progressOutcome: e.progressOutcome,
                furtherActionRequired: e.furtherActionRequired,
                recommendations: e.recommendations,
                nextFollowUpDate: e.nextFollowUpDate,
              };
            })
        : [];

      const health = (type === 'all' || type === 'health')
        ? db.healthFollowUps
            .filter((h) => h.girlId === girl.id)
            .map((h) => {
              accessedRecordIds.add(h.id);
              return {
                id: h.id,
                date: h.date,
                reasonForVisit: h.reasonForVisit,
                healthIssueComplaint: h.healthIssueComplaint,
                medicalFacility: h.medicalFacility,
                treatmentProvided: h.treatmentProvided,
                outcome: h.outcome,
                furtherActionRequired: h.furtherActionRequired,
                recommendations: h.recommendations,
                nextFollowUpDate: h.nextFollowUpDate,
              };
            })
        : [];

      const family = (type === 'all' || type === 'family')
        ? db.familyFollowUps
            .filter((f) => f.girlId === girl.id)
            .map((f) => {
              accessedRecordIds.add(f.id);
              return {
                id: f.id,
                date: f.date,
                contactType: f.contactType,
                familySituation: f.familySituation,
                challengesOrConcerns: f.challengesOrConcerns,
                supportProvided: f.supportProvided,
                furtherActionRequired: f.furtherActionRequired,
                recommendations: f.recommendations,
                nextFollowUpDate: f.nextFollowUpDate,
              };
            })
        : [];

      return {
        girlId: girl.id,
        girlName: girl.fullName,
        educationalFollowUps: edu,
        healthFollowUps: health,
        familyFollowUps: family,
        totalFollowUps: edu.length + health.length + family.length,
      };
    }

    case 'searchHouseholds': {
      const q = (args.query || '').toLowerCase().trim();
      const status = args.status;

      const houses = db.households
        .filter((h) => {
          if (q) {
            const matchName = h.name.toLowerCase().includes(q);
            const matchLoc = h.location.toLowerCase().includes(q);
            if (!matchName && !matchLoc) return false;
          }
          if (status && h.status !== status) return false;
          return true;
        })
        .map((h) => {
          accessedRecordIds.add(h.id);
          const residents = db.girls.filter((g) => g.householdId === h.id && g.status === 'Active');
          return {
            id: h.id,
            name: h.name,
            location: h.location,
            houseMum: h.houseMum,
            houseMumPhone: h.houseMumPhone,
            currentActiveResidentsCount: residents.length,
            monthlyRentCostMWK: h.monthlyRentCost,
            status: h.status,
          };
        });

      return { count: houses.length, households: houses };
    }

    case 'getHouseholdProfile': {
      const targetId = (args.householdId || '').toLowerCase().trim();
      const house = db.households.find(
        (h) => h.id.toLowerCase() === targetId || h.name.toLowerCase().includes(targetId)
      );

      if (!house) {
        return { error: `Household "${args.householdId}" not found.` };
      }

      accessedRecordIds.add(house.id);
      const residents = db.girls
        .filter((g) => g.householdId === house.id)
        .map((g) => {
          accessedRecordIds.add(g.id);
          return { id: g.id, fullName: g.fullName, status: g.status, school: g.school, classLevel: g.classLevel };
        });

      return {
        id: house.id,
        name: house.name,
        location: house.location,
        houseMum: house.houseMum,
        houseMumPhone: house.houseMumPhone || 'None',
        monthlyRentCostMWK: house.monthlyRentCost,
        status: house.status,
        notes: house.notes || 'None recorded',
        currentResidents: residents,
        activeResidentCount: residents.filter((r) => r.status === 'Active').length,
      };
    }

    case 'getHouseholdFollowUps': {
      const targetId = (args.householdId || '').toLowerCase().trim();
      const house = db.households.find(
        (h) => h.id.toLowerCase() === targetId || h.name.toLowerCase().includes(targetId)
      );

      if (!house) {
        return { error: `Household "${args.householdId}" not found.` };
      }

      accessedRecordIds.add(house.id);
      const activities = db.householdActivities
        .filter((a) => a.householdId === house.id)
        .map((a) => {
          accessedRecordIds.add(a.id);
          return {
            id: a.id,
            date: a.date,
            activityName: a.activityName,
            activityType: a.activityType,
            description: a.description,
            participantCount: a.participantCount,
            outcome: a.outcome,
            challenges: a.challenges,
            furtherActionRequired: a.furtherActionRequired,
            nextFollowUpDate: a.nextFollowUpDate,
            recordedBy: a.recordedBy,
          };
        });

      return {
        householdId: house.id,
        householdName: house.name,
        activities,
      };
    }

    case 'getRentRecords': {
      const hId = (args.householdId || '').toLowerCase().trim();
      const month = (args.month || '').toLowerCase().trim();
      const year = args.year ? Number(args.year) : undefined;
      const status = args.status;

      const records = db.rentPayments
        .filter((r) => {
          if (hId && r.householdId.toLowerCase() !== hId) return false;
          if (month && !r.monthCovered.toLowerCase().includes(month)) return false;
          if (year && !r.monthCovered.includes(String(year)) && !r.datePaid.startsWith(String(year))) return false;
          if (status && r.paymentStatus !== status) return false;
          return true;
        })
        .map((r) => {
          accessedRecordIds.add(r.id);
          const house = db.households.find((h) => h.id === r.householdId);
          return {
            id: r.id,
            householdId: r.householdId,
            householdName: house ? house.name : 'Unknown House',
            monthCovered: r.monthCovered,
            datePaid: r.datePaid,
            amountPaidMWK: r.amountPaid,
            paymentStatus: r.paymentStatus,
            receiptNumber: r.receiptNumber || 'None',
            notes: r.notes || '',
          };
        });

      const totalPaid = records
        .filter((r) => r.paymentStatus === 'Paid' || r.paymentStatus === 'Partially paid')
        .reduce((sum, r) => sum + r.amountPaidMWK, 0);

      return {
        count: records.length,
        totalAmountRecordedMWK: totalPaid,
        records,
      };
    }

    case 'getHouseholdExpenses': {
      const hId = (args.householdId || '').toLowerCase().trim();
      const monthStr = (args.month || '').toLowerCase().trim();
      const year = args.year ? Number(args.year) : undefined;
      const category = (args.category || '').toLowerCase().trim();

      const expenses = db.expenses
        .filter((e) => {
          if (hId && e.householdId.toLowerCase() !== hId) return false;
          if (category && e.category.toLowerCase() !== category) return false;
          if (year && !e.date.startsWith(String(year))) return false;
          if (monthStr) {
            const d = new Date(e.date);
            const mName = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
            if (!mName.includes(monthStr) && !e.date.includes(monthStr)) return false;
          }
          return true;
        })
        .map((e) => {
          accessedRecordIds.add(e.id);
          const house = db.households.find((h) => h.id === e.householdId);
          return {
            id: e.id,
            householdName: house ? house.name : 'Unknown',
            date: e.date,
            category: e.category,
            itemDescription: e.itemDescription,
            quantity: e.quantity,
            unitCostMWK: e.unitCost,
            totalCostMWK: e.totalCost,
            supplier: e.supplier || 'N/A',
            notes: e.notes || '',
          };
        });

      const totalAmount = expenses.reduce((sum, e) => sum + e.totalCostMWK, 0);
      const categoryBreakdown: Record<string, number> = {};
      expenses.forEach((e) => {
        categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + e.totalCostMWK;
      });

      return {
        count: expenses.length,
        totalExpensesMWK: totalAmount,
        categoryBreakdown,
        expenses: expenses.slice(0, 50),
      };
    }

    case 'getGroupActivities': {
      const hId = (args.householdId || '').toLowerCase().trim();
      const activities = db.householdActivities
        .filter((a) => {
          if (hId && a.householdId.toLowerCase() !== hId) return false;
          if (args.year && !a.date.startsWith(String(args.year))) return false;
          return true;
        })
        .map((a) => {
          accessedRecordIds.add(a.id);
          const house = db.households.find((h) => h.id === a.householdId);
          return {
            id: a.id,
            householdName: house ? house.name : 'Unknown',
            date: a.date,
            activityName: a.activityName,
            activityType: a.activityType,
            participantCount: a.participantCount,
            description: a.description,
            outcome: a.outcome,
            challenges: a.challenges,
            supportProvided: a.supportProvided,
            furtherActionRequired: a.furtherActionRequired,
            recordedBy: a.recordedBy || 'Staff',
          };
        });

      return { count: activities.length, activities };
    }

    case 'getOutstandingFollowUps': {
      const overdueOnly = args.overdueOnly === true;
      const daysAhead = args.daysAhead || 30;
      const targetGirlId = (args.girlId || '').toLowerCase().trim();

      const futureLimit = new Date();
      futureLimit.setDate(futureLimit.getDate() + daysAhead);
      const futureLimitStr = futureLimit.toISOString().split('T')[0];

      const list: Array<{
        girlId: string;
        girlName: string;
        followUpType: 'Educational' | 'Health' | 'Family';
        recordId: string;
        date: string;
        issueAction: string;
        nextFollowUpDate: string;
        furtherActionRequired: boolean;
        isOverdue: boolean;
      }> = [];

      // Check Educational
      db.educationalFollowUps.forEach((e) => {
        if (targetGirlId && e.girlId.toLowerCase() !== targetGirlId) return;
        if (e.furtherActionRequired === false && !e.nextFollowUpDate) return;
        const isOverdue = !!(e.nextFollowUpDate && e.nextFollowUpDate < todayStr);
        const isUpcoming = !!(
          e.nextFollowUpDate &&
          e.nextFollowUpDate >= todayStr &&
          e.nextFollowUpDate <= futureLimitStr
        );

        if (isOverdue || (!overdueOnly && isUpcoming)) {
          const girl = db.girls.find((g) => g.id === e.girlId);
          accessedRecordIds.add(e.id);
          if (girl) accessedRecordIds.add(girl.id);
          list.push({
            girlId: e.girlId,
            girlName: girl ? girl.fullName : 'Unknown',
            followUpType: 'Educational',
            recordId: e.id,
            date: e.date,
            issueAction: e.academicIssue || e.problemsExperienced || e.supportProvided || 'Educational review',
            nextFollowUpDate: e.nextFollowUpDate || 'Not specified',
            furtherActionRequired: e.furtherActionRequired,
            isOverdue,
          });
        }
      });

      // Check Health
      db.healthFollowUps.forEach((h) => {
        if (targetGirlId && h.girlId.toLowerCase() !== targetGirlId) return;
        if (h.furtherActionRequired === false && !h.nextFollowUpDate) return;
        const isOverdue = !!(h.nextFollowUpDate && h.nextFollowUpDate < todayStr);
        const isUpcoming = !!(
          h.nextFollowUpDate &&
          h.nextFollowUpDate >= todayStr &&
          h.nextFollowUpDate <= futureLimitStr
        );

        if (isOverdue || (!overdueOnly && isUpcoming)) {
          const girl = db.girls.find((g) => g.id === h.girlId);
          accessedRecordIds.add(h.id);
          if (girl) accessedRecordIds.add(girl.id);
          list.push({
            girlId: h.girlId,
            girlName: girl ? girl.fullName : 'Unknown',
            followUpType: 'Health',
            recordId: h.id,
            date: h.date,
            issueAction: h.reasonForVisit || h.healthIssueComplaint || 'Medical visit',
            nextFollowUpDate: h.nextFollowUpDate || 'Not specified',
            furtherActionRequired: h.furtherActionRequired,
            isOverdue,
          });
        }
      });

      // Check Family
      db.familyFollowUps.forEach((f) => {
        if (targetGirlId && f.girlId.toLowerCase() !== targetGirlId) return;
        if (f.furtherActionRequired === false && !f.nextFollowUpDate) return;
        const isOverdue = !!(f.nextFollowUpDate && f.nextFollowUpDate < todayStr);
        const isUpcoming = !!(
          f.nextFollowUpDate &&
          f.nextFollowUpDate >= todayStr &&
          f.nextFollowUpDate <= futureLimitStr
        );

        if (isOverdue || (!overdueOnly && isUpcoming)) {
          const girl = db.girls.find((g) => g.id === f.girlId);
          accessedRecordIds.add(f.id);
          if (girl) accessedRecordIds.add(girl.id);
          list.push({
            girlId: f.girlId,
            girlName: girl ? girl.fullName : 'Unknown',
            followUpType: 'Family',
            recordId: f.id,
            date: f.date,
            issueAction: f.challengesOrConcerns || f.supportProvided || 'Home visit review',
            nextFollowUpDate: f.nextFollowUpDate || 'Not specified',
            furtherActionRequired: f.furtherActionRequired,
            isOverdue,
          });
        }
      });

      // Sort by nextFollowUpDate ascending
      list.sort((a, b) => a.nextFollowUpDate.localeCompare(b.nextFollowUpDate));

      return {
        overdueCount: list.filter((i) => i.isOverdue).length,
        upcomingCount: list.filter((i) => !i.isOverdue).length,
        followUps: list,
      };
    }

    case 'getDashboardStatistics': {
      const activeGirls = db.girls.filter((g) => g.status === 'Active');
      const inPrimary = activeGirls.filter((g) =>
        g.classLevel.toLowerCase().includes('standard') || g.classLevel.toLowerCase().includes('primary')
      ).length;
      const inSecondary = activeGirls.filter((g) =>
        g.classLevel.toLowerCase().includes('form') || g.classLevel.toLowerCase().includes('secondary')
      ).length;

      const totalOccupancy = db.girls.filter((g) => g.householdId && g.status === 'Active').length;

      // Count follow-ups this month
      const currentYearMonth = todayStr.substring(0, 7);
      const eduThisMonth = db.educationalFollowUps.filter((e) => e.date.startsWith(currentYearMonth)).length;
      const healthThisMonth = db.healthFollowUps.filter((h) => h.date.startsWith(currentYearMonth)).length;
      const familyThisMonth = db.familyFollowUps.filter((f) => f.date.startsWith(currentYearMonth)).length;

      // Overdue follow ups
      const overdueEdu = db.educationalFollowUps.filter(
        (e) => e.nextFollowUpDate && e.nextFollowUpDate < todayStr && e.furtherActionRequired
      ).length;
      const overdueHealth = db.healthFollowUps.filter(
        (h) => h.nextFollowUpDate && h.nextFollowUpDate < todayStr && h.furtherActionRequired
      ).length;
      const overdueFamily = db.familyFollowUps.filter(
        (f) => f.nextFollowUpDate && f.nextFollowUpDate < todayStr && f.furtherActionRequired
      ).length;
      const actions = db.caseActions || [];
      const openActions = actions.filter((action) => !['Completed', 'Cancelled'].includes(action.status));
      const overdueActions = openActions.filter((action) => action.dueDate < todayStr).length;
      const upcomingReviews = (db.caseReviews || []).filter((review) => review.nextReviewDate && review.nextReviewDate >= todayStr).length;
      const girlsOnLeave = (db.girlLeaves || []).filter((leave) => leave.status === 'Active').length;

      return {
        totalGirlsEnrolled: db.girls.length,
        activeGirls: activeGirls.length,
        educationBreakdown: {
          primarySchoolCount: inPrimary,
          secondarySchoolCount: inSecondary,
          otherOrTertiary: activeGirls.length - inPrimary - secondarySchoolCount(activeGirls),
        },
        households: {
          totalHouseholds: db.households.length,
          activeHouseholds: db.households.filter((h) => h.status === 'Active').length,
          currentOccupancy: totalOccupancy,
        },
        followUpsThisMonth: {
          month: currentYearMonth,
          educational: eduThisMonth,
          health: healthThisMonth,
          family: familyThisMonth,
          total: eduThisMonth + healthThisMonth + familyThisMonth,
        },
        overdueFollowUpsCount: overdueEdu + overdueHealth + overdueFamily,
        openCaseActions: openActions.length,
        overdueCaseActions: overdueActions,
        highPriorityCaseActions: openActions.filter((action) => ['High', 'Urgent'].includes(action.priority)).length,
        girlsOnLeave,
        upcomingCaseReviews: upcomingReviews,
      };
    }

    case 'getCaseActions': {
      const girlId = String(args.girlId || '').toLowerCase();
      const householdId = String(args.householdId || '').toLowerCase();
      const status = String(args.status || '').toLowerCase();
      const overdueOnly = args.overdueOnly === true;
      const actions = (db.caseActions || []).filter((action) => {
        if (girlId && action.girlId?.toLowerCase() !== girlId) return false;
        if (householdId && action.householdId?.toLowerCase() !== householdId) return false;
        if (status && action.status.toLowerCase() !== status) return false;
        if (overdueOnly && (action.dueDate >= todayStr || ['Completed', 'Cancelled'].includes(action.status))) return false;
        return true;
      }).map((action) => {
        accessedRecordIds.add(action.id);
        return {
          id: action.id,
          title: action.title,
          description: action.description,
          girlId: action.girlId,
          householdId: action.householdId,
          priority: action.priority,
          status: action.dueDate < todayStr && !['Completed', 'Cancelled'].includes(action.status) ? 'Overdue' : action.status,
          assignedStaffName: action.assignedStaffName,
          dueDate: action.dueDate,
          completedAt: action.completedAt,
          completionNotes: action.completionNotes,
        };
      });
      return { count: actions.length, actions };
    }

    case 'getGirlEducationHistory': {
      const targetGirlId = String(args.girlId || '').toLowerCase();
      const girl = db.girls.find((record) => record.id.toLowerCase() === targetGirlId || record.fullName.toLowerCase() === targetGirlId);
      if (!girl) return { error: `No girl found matching "${args.girlId}".` };
      accessedRecordIds.add(girl.id);
      const history = (db.educationHistory || []).filter((record) => record.girlId === girl.id).map((record) => {
        accessedRecordIds.add(record.id);
        return record;
      });
      const support = (db.academicSupports || []).filter((record) => record.girlId === girl.id).map((record) => {
        accessedRecordIds.add(record.id);
        return record;
      });
      const exams = (db.examinationRecords || []).filter((record) => record.girlId === girl.id).map((record) => {
        accessedRecordIds.add(record.id);
        return record;
      });
      return {
        girl: { id: girl.id, fullName: girl.fullName, currentSchool: girl.school, currentClass: girl.classLevel },
        educationHistory: history,
        academicSupport: support,
        examinations: exams,
      };
    }

    case 'getGirlsOnLeave': {
      const records = (db.girlLeaves || []).filter((record) => record.status === 'Active').map((record) => {
        accessedRecordIds.add(record.id);
        const girl = db.girls.find((candidate) => candidate.id === record.girlId);
        if (girl) accessedRecordIds.add(girl.id);
        return { girlName: girl?.fullName || 'Unknown', girlId: record.girlId, leaveType: record.leaveType, startDate: record.startDate, expectedReturnDate: record.expectedReturnDate, reason: record.reason };
      });
      return { count: records.length, leaveRecords: records };
    }

    case 'getUpcomingCaseReviews': {
      const daysAhead = Math.max(1, Math.min(365, Number(args.daysAhead) || 30));
      const endDate = new Date();
      endDate.setUTCDate(endDate.getUTCDate() + daysAhead);
      const endDateStr = endDate.toISOString().slice(0, 10);
      const records = (db.caseReviews || []).filter((review) => review.nextReviewDate && review.nextReviewDate >= todayStr && review.nextReviewDate <= endDateStr).map((review) => {
        accessedRecordIds.add(review.id);
        return { id: review.id, girlId: review.girlId, reviewDate: review.reviewDate, nextReviewDate: review.nextReviewDate, progress: review.progress, actionPlan: review.actionPlan };
      });
      return { count: records.length, reviews: records };
    }

    case 'getReportData': {
      const monthInput = String(args.month).toLowerCase().trim();
      const year = Number(args.year);

      // Map month name to 2-digit representation
      const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
      ];
      let monthIndex = monthNames.findIndex((m) => m.startsWith(monthInput));
      if (monthIndex === -1 && !isNaN(Number(monthInput))) {
        monthIndex = Number(monthInput) - 1;
      }
      const monthNumStr = monthIndex >= 0 ? String(monthIndex + 1).padStart(2, '0') : '';
      const prefix = monthNumStr ? `${year}-${monthNumStr}` : `${year}`;

      const eduThisMonth = db.educationalFollowUps.filter((e) => e.date.startsWith(prefix));
      const healthThisMonth = db.healthFollowUps.filter((h) => h.date.startsWith(prefix));
      const familyThisMonth = db.familyFollowUps.filter((f) => f.date.startsWith(prefix));
      const activitiesThisMonth = db.householdActivities.filter((a) => a.date.startsWith(prefix));
      const expensesThisMonth = db.expenses.filter((e) => e.date.startsWith(prefix));
      const rentThisMonth = db.rentPayments.filter((r) => {
        if (!r.monthCovered.includes(String(year)) && !r.datePaid.startsWith(String(year))) return false;
        if (monthIndex >= 0 && !r.monthCovered.toLowerCase().includes(monthNames[monthIndex])) return false;
        return true;
      });

      const totalExpenses = expensesThisMonth.reduce((acc, e) => acc + e.totalCost, 0);
      const totalRentPaid = rentThisMonth.reduce((acc, r) => acc + r.amountPaid, 0);

      const expenseCategories: Record<string, number> = {};
      expensesThisMonth.forEach((e) => {
        expenseCategories[e.category] = (expenseCategories[e.category] || 0) + e.totalCost;
      });

      return {
        reportingPeriod: {
          month: monthIndex >= 0 ? monthNames[monthIndex] : monthInput,
          year,
          filterPrefix: prefix,
        },
        verifiedFigures: {
          totalActiveBeneficiaries: db.girls.filter((g) => g.status === 'Active').length,
          educationalFollowUpsCount: eduThisMonth.length,
          medicalHealthFollowUpsCount: healthThisMonth.length,
          familyHomeVisitsCount: familyThisMonth.length,
          totalInterventionsCount: eduThisMonth.length + healthThisMonth.length + familyThisMonth.length,
          groupActivitiesConducted: activitiesThisMonth.length,
          totalRentPaidMWK: totalRentPaid,
          rentRecordsCount: rentThisMonth.length,
          totalHouseholdExpenditureMWK: totalExpenses,
          expensesBreakdown: expenseCategories,
        },
      };
    }

    default:
      return { error: `Tool ${name} is not recognized or not permitted.` };
  }
}

function calculateAge(dateOfBirth: string): number {
  const diff = Date.now() - new Date(dateOfBirth).getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function secondarySchoolCount(activeGirls: Girl[]): number {
  return activeGirls.filter((g) =>
    g.classLevel.toLowerCase().includes('form') || g.classLevel.toLowerCase().includes('secondary')
  ).length;
}
