'use strict';

const Student = require('../models/studentModel');
const FeeStructure = require('../models/feeStructureModel');
const { get, set, del, KEYS, TTL } = require('../cache');

// POST /api/students
async function registerStudent(req, res, next) {
  try {
    const { schoolId } = req; // injected by resolveSchool middleware
    let { studentId, name, class: className, feeAmount } = req.body;
    if (!studentId) {
      const { generateStudentId } = require('../utils/generateStudentId');
      studentId = await generateStudentId();
    }

    // Exact duplicate check by studentId (school-scoped)
    const existingStudent = await Student.findOne({ schoolId, studentId });
    if (existingStudent) {
      const err = new Error(`A student with ID "${studentId}" already exists`);
      err.code = 'DUPLICATE_STUDENT';
      return next(err);
    }

    // Fuzzy duplicate check (same name + class, case-insensitive, school-scoped)
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const similarStudent = await Student.findOne({
      schoolId,
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
      class: className,
    });

    let assignedFee = feeAmount;
    if (assignedFee == null && className) {
      const feeStructure = await FeeStructure.findOne({ schoolId, className, isActive: true });
      if (feeStructure) assignedFee = feeStructure.feeAmount;
    }

    if (assignedFee == null) {
      const err = new Error(
        `No fee amount provided and no fee structure found for class "${className}" in this school. ` +
        `Please create a fee structure first or provide feeAmount.`
      );
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }

    const student = await Student.create({ schoolId, studentId, name, class: className, feeAmount: assignedFee });

    // Invalidate student list cache since a new student was added
    del(KEYS.studentsAll());

    const response = student.toObject ? student.toObject() : { ...student };
    if (similarStudent) {
      response.warning = `A student named "${similarStudent.name}" already exists in class ${className} with ID "${similarStudent.studentId}". This may be a duplicate.`;
    }
    res.status(201).json(response);
  } catch (err) {
    if (err.code === 11000) {
      const e = new Error('Student ID already exists in this school');
      e.code = 'DUPLICATE_STUDENT';
      e.status = 409;
      return next(e);
    }
    next(err);
  }
}

// GET /api/students
async function getAllStudents(req, res, next) {
  try {
    const cacheKey = KEYS.studentsAll();
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const students = await Student.find({ schoolId: req.schoolId }).sort({ createdAt: -1 });
    set(cacheKey, students, TTL.STUDENTS);
    res.json(students);
  } catch (err) {
    next(err);
  }
}

// GET /api/students/:studentId
async function getStudent(req, res, next) {
  try {
    const { studentId } = req.params;
    const cacheKey = KEYS.student(studentId);
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const student = await Student.findOne({ schoolId: req.schoolId, studentId });
    if (!student) {
      const err = new Error('Student not found');
      err.code = 'NOT_FOUND';
      return next(err);
    }
    set(cacheKey, student, TTL.STUDENT);
    res.json(student);
  } catch (err) {
    next(err);
  }
}

module.exports = { registerStudent, getAllStudents, getStudent };
