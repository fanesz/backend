import BaseMongoService from "@base/mongoService";
import { DataFilter, Pagination, ServiceError } from "@types";
import {
  StatusBadRequest,
  StatusConflict,
  StatusNotFound,
} from "@consts/statusCodes";
import { isValidObjectId } from "mongoose";
import { CompanyModel } from "../models/company.model";
import { CompanyDto } from "../dtos/company.dto";
import { CompanyResDto } from "../dtos/companyRes.dto";
import UserService from "@user/services/user.service";
import { isIdEquals } from "@utils/compare";
import { CompanyCreateDto } from "../dtos/companyCreate.dto";
import moment from "moment";
import { companyMapper } from "@mapper/company.mapper";
import { ROLE_COMPANY } from "@enums/consts/roles";
import { CompanyUpdateDto } from "@company/dtos/companyUpdate.dto";

class CompanyService extends BaseMongoService<CompanyDto> {
  private userService = new UserService();

  constructor() {
    super(CompanyModel);
  }

  public async getAllCompanies(
    filters: DataFilter,
    paginator?: Pagination,
  ): Promise<CompanyResDto[] | ServiceError> {
    const companies = await this.find(filters, paginator);
    if (!companies) {
      return this.throwError("Error getting companies", StatusBadRequest);
    }

    const userIds = companies.map((company) => company.userId);

    const users = await this.userService.find({
      query: { _id: { $in: userIds } },
    });
    if (!users) {
      return this.throwError("Error getting users", StatusBadRequest);
    }

    return companies.map((company) => {
      return companyMapper(
        company,
        users.find((u) => isIdEquals(u._id, company.userId))!,
      );
    });
  }

  public async getCompanyById(
    id: string,
  ): Promise<CompanyResDto | ServiceError> {
    if (!isValidObjectId(id)) {
      return this.throwError("Invalid company ID", StatusBadRequest);
    }

    const company = await this.findOne({ _id: id });
    if (!company) {
      return this.throwError("User not found", StatusNotFound);
    }

    const user = await this.userService.findOne({ _id: company.userId });
    if (!user) {
      return this.throwError("Error getting user", StatusBadRequest);
    }

    return companyMapper(company, user);
  }

  public async createCompany(
    data: Partial<CompanyCreateDto>,
    userId: string,
  ): Promise<string | ServiceError> {
    const company = await this.findOne({ userId });
    if (company) {
      return this.throwError("Company already registered", StatusConflict);
    }

    const createCompanyPayload = {
      userId: userId,
      companyType: data.companyType,
      companyName: data.companyName,
      foundingDate: moment(data.foundingDate).toDate(),
      employeeTotal: data.employeeTotal,
      earlyWorkingHour: data.earlyWorkingHour,
      endWorkingHour: data.endWorkingHour,
    };

    const [newCompany, updatedUser] = await Promise.all([
      this.create(createCompanyPayload),
      this.userService.update({ _id: userId }, { role: ROLE_COMPANY }),
    ]);
    if (!newCompany) {
      this.userService.update({ _id: userId }, { role: null });
      return this.throwError("Error creating company", StatusBadRequest);
    }
    if (!updatedUser) {
      this.delete({ _id: newCompany._id });
      return this.throwError("Error updating user", StatusBadRequest);
    }

    return newCompany._id as string;
  }

  public async updateCompany(
    data: Partial<CompanyUpdateDto>,
    userId: string,
  ): Promise<string | ServiceError> {
    const company = await this.findOne({ userId });
    if (!company) {
      return this.throwError("Company not found", StatusConflict);
    }

    const updatedCompany = await this.update(
      { _id: company._id },
      {
        companyType: data.companyType,
        companyName: data.companyName,
        foundingDate: moment(data.foundingDate).toDate(),
        employeeTotal: data.employeeTotal,
        earlyWorkingHour: data.earlyWorkingHour,
        endWorkingHour: data.endWorkingHour,
      },
    );
    if (!updatedCompany) {
      return this.throwError("Error updating company", StatusBadRequest);
    }

    return updatedCompany._id as string;
  }
}

export default CompanyService;
